import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Dimensions,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';

const PublicProfile = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  
  const { username } = route.params || {};
  
  // Not: Burada mock veri yerine gerçek API'den doldurulması beklenir.
  const publicUser = useMemo(() => ({
    id: '',
    name: username || 'Danışman',
    username: username || '',
    profilePicture: null,
    officeName: '',
    city: '',
    expertTitle: '',
    bio: '',
    instagram: '',
    facebook: '',
    youtube: '',
    phone: '',
    whatsapp: '',
    createdAt: new Date(),
  }), [username]);

  // Not: Burada mock portföyler yerine gerçek veriler doldurulmalıdır.
  const userPortfolios = useMemo(() => [], []);

  const renderProfileHeader = useCallback(() => (
    <View style={styles.profileHeader}>
      {/* Profil Resmi ve Bilgiler */}
      <View style={styles.profileMainContainer}>
        <View style={styles.profileImageContainer}>
          <Image
            source={
              publicUser.profilePicture && publicUser.profilePicture !== 'default-logo'
                ? { uri: publicUser.profilePicture }
                : require('../assets/images/logo-krimson.png')
            }
            style={[styles.profileImage, { borderColor: theme.colors.error }]}
            defaultSource={require('../assets/images/logo-krimson.png')}
          />
        </View>

        <View style={styles.profileInfoContainer}>
          <Text style={[styles.profileName, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
            {publicUser.name}
          </Text>
          
          <View style={styles.badgesContainer}>
            {publicUser.officeName && (
              <View style={[styles.officeBadge, { backgroundColor: theme.colors.error }]}>
                <Image source={require('../assets/images/icons/ofis.png')} style={styles.officeIcon} />
                <Text style={[styles.officeBadgeText, { color: theme.colors.white }]}>
                  {publicUser.officeName}
                </Text>
              </View>
            )}
            
            {publicUser.city && (
              <View style={[styles.cityBadge, { backgroundColor: theme.colors.error }]}>
                <Image source={require('../assets/images/icons/haritas.png')} style={styles.pinIcon} />
                <Text style={[styles.cityBadgeText, { color: theme.colors.white }]}>
                  {publicUser.city}
                </Text>
              </View>
            )}
            
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: theme.spacing.sm }}>
              <View style={[styles.expertBadge, { backgroundColor: '#142331', flexDirection: 'row', alignItems: 'center' }]}> 
                <Image source={require('../assets/images/icons/badge.png')} style={styles.badgeIcon} />
                <Text style={[styles.expertBadgeText, { color: theme.colors.white }]}> 
                  {publicUser.expertTitle}
                </Text>
              </View>
              <View style={[styles.mykBadge, { backgroundColor: '#142331' }]}>
                <Image source={require('../assets/images/icons/myk.png')} style={styles.mykIcon} />
                <View style={styles.mykSeparator}>
                  <View style={styles.mykSeparatorDot} />
                  <View style={styles.mykSeparatorDot} />
                </View>
                <Image source={require('../assets/images/icons/tick.png')} style={styles.mykTickIcon} />
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Sosyal Medya ve İletişim Badge'leri */}
      <View style={styles.badgesRow}>
        <View style={styles.socialMediaBadge}>
          <TouchableOpacity
            style={styles.socialIconButton}
            accessibilityRole="button"
            accessibilityLabel="Instagram"
          >
            <Image source={require('../assets/images/icons/instagram.png')} style={styles.socialIcon} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.socialIconButton}
            accessibilityRole="button"
            accessibilityLabel="Facebook"
          >
            <Image source={require('../assets/images/icons/facebook.png')} style={styles.socialIcon} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.socialIconButton}
            accessibilityRole="button"
            accessibilityLabel="YouTube"
          >
            <Image source={require('../assets/images/icons/Youtube.png')} style={styles.socialIcon} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.contactBadge}>
          <TouchableOpacity
            style={[styles.phoneButton, { backgroundColor: '#142331' }]}
            accessibilityRole="button"
            accessibilityLabel="Ara"
          > 
            <Image source={require('../assets/images/icons/phonefill.png')} style={styles.contactIcon} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.whatsappButton, { backgroundColor: '#25D366' }]}
            accessibilityRole="button"
            accessibilityLabel="WhatsApp"
          >
            <Image source={require('../assets/images/icons/whatsapp.png')} style={styles.whatsappIcon} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Ayırıcı Çizgi */}
      <View style={styles.divider} />

      {/* İstatistikler */}
      <View style={[styles.profileStats, { backgroundColor: theme.colors.navy }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: theme.colors.error }]}>{userPortfolios.length}</Text>
          <Text style={[styles.statLabel, { color: theme.colors.white }]}>Portföy</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: theme.colors.error }]}>
            {userPortfolios.filter(p => p.isPublished).length}
          </Text>
          <Text style={[styles.statLabel, { color: theme.colors.white }]}>Yayında</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: theme.colors.error }]}>
            {Math.floor((new Date() - new Date(publicUser.createdAt)) / (1000 * 60 * 60 * 24))}
          </Text>
          <Text style={[styles.statLabel, { color: theme.colors.white }]}>Gün</Text>
        </View>
      </View>

      {/* Hakkında Bölümü */}
      <View style={[styles.aboutSection, { backgroundColor: theme.colors.navy }]}>
        <Text style={[styles.aboutTitle, { color: theme.colors.white }]}>Hakkında</Text>
        <Text style={[styles.aboutText, { color: theme.colors.white }]}>
          {publicUser.bio}
        </Text>
      </View>

      {/* Portföylerim Bölümü */}
      <View style={[styles.portfoliosSection, { backgroundColor: theme.colors.navy }]}>
        <Text style={[styles.portfoliosTitle, { color: theme.colors.white }]}>Portföylerim</Text>
        <View style={styles.portfoliosList}>
          {userPortfolios
            .filter(portfolio => portfolio.isPublished)
            .map((portfolio, index) => (
              <TouchableOpacity 
                key={portfolio.id} 
                style={styles.portfolioItem}
              >
                <Image 
                  source={portfolio.images && portfolio.images.length > 0 
                    ? { uri: portfolio.images[0] } 
                    : require('../assets/images/logo-krimson.png')
                  } 
                  style={styles.portfolioImage}
                />
                <View style={styles.portfolioInfo}>
                  <Text style={[styles.portfolioTitle, { color: theme.colors.white }]} numberOfLines={2}>
                    {portfolio.title}
                  </Text>
                  <Text style={[styles.portfolioLocation, { color: theme.colors.white }]} numberOfLines={1}>
                    {portfolio.location}
                  </Text>
                  <Text style={[styles.portfolioPrice, { color: theme.colors.error }]}>
                    {portfolio.price ? `${portfolio.price.toLocaleString()} TL` : 'Fiyat Belirtilmemiş'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          {userPortfolios.filter(portfolio => portfolio.isPublished).length === 0 && (
            <View style={styles.emptyPortfolios}>
              <Text style={[styles.emptyPortfoliosText, { color: theme.colors.white }]}>
                Henüz yayınlanmış portföy bulunmuyor
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  ), [publicUser, userPortfolios, isDark]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        {/* Header - Sadece geri butonu */}
        <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Geri"
            >
              <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
            </TouchableOpacity>
          </View>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
              {publicUser.name}
            </Text>
          </View>

          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: insets.bottom + 50 },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {renderProfileHeader()}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  headerLeft: {
    flex: 1,
  },

  headerCenter: {
    flex: 2,
    alignItems: 'center',
  },

  headerRight: {
    flex: 1,
  },

  headerButtonBack: {
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerButtonIconBack: {
    width: 14,
    height: 14,
    tintColor: theme.colors.white,
  },

  headerTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },

  content: {
    flex: 1,
  },

  contentContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },

  profileHeader: {
    marginBottom: theme.spacing.xl,
  },

  profileMainContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
    position: 'relative',
  },

  profileImageContainer: {
    position: 'relative',
  },

  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: theme.colors.primary,
  },

  profileInfoContainer: {
    flex: 1,
    marginLeft: theme.spacing.md,
    marginTop: -10,
  },

  profileName: {
    fontSize: 28,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.sm,
    marginTop: 8,
  },

  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },

  officeBadge: {
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },

  officeIcon: {
    width: 14,
    height: 14,
    marginRight: 6,
    tintColor: theme.colors.white,
  },

  officeBadgeText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.white,
  },

  cityBadge: {
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },

  pinIcon: {
    width: 14,
    height: 14,
    marginRight: 6,
    tintColor: theme.colors.white,
  },

  cityBadgeText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.white,
  },

  expertBadge: {
    backgroundColor: '#142331',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.white,
  },

  expertBadgeText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.white,
  },

  badgeIcon: {
    width: 14,
    height: 14,
    tintColor: theme.colors.white,
    marginRight: 6,
  },

  mykBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.white,
    flexDirection: 'row',
    alignItems: 'center',
  },

  mykIcon: {
    width: 14,
    height: 14,
    marginRight: 4,
  },

  mykTickIcon: {
    width: 12,
    height: 12,
    tintColor: theme.colors.success,
  },

  mykSeparatorDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.white,
  },

  mykSeparator: {
    marginHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 1,
  },

  badgesRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.md,
    gap: theme.spacing.md,
    width: '100%',
  },

  socialMediaBadge: {
    flexDirection: 'row',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 4,
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },

  socialIconButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  socialIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
  },

  contactBadge: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.error,
    flex: 1,
  },

  phoneButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },

  whatsappButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },

  contactIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
  },

  whatsappIcon: {
    width: 28,
    height: 24,
    tintColor: theme.colors.white,
  },

  divider: {
    height: 2,
    backgroundColor: theme.colors.error,
    marginHorizontal: theme.spacing.lg,
    marginVertical: theme.spacing.lg,
    borderRadius: 1,
  },

  profileStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 12,
    marginBottom: theme.spacing.lg,
  },

  statItem: {
    alignItems: 'center',
  },

  statNumber: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
  },

  statLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.white,
    marginTop: theme.spacing.xs,
  },

  aboutSection: {
    padding: theme.spacing.lg,
    borderRadius: 12,
    marginBottom: theme.spacing.lg,
  },

  aboutTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.sm,
  },

  aboutText: {
    fontSize: theme.fontSizes.md,
    lineHeight: 24,
    fontStyle: 'italic',
    color: theme.colors.white,
  },

  portfoliosSection: {
    padding: theme.spacing.lg,
    borderRadius: 12,
    marginBottom: theme.spacing.xl,
  },

  portfoliosTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.md,
  },

  portfoliosList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },

  portfolioItem: {
    width: '48%',
    backgroundColor: theme.colors.surface + '20',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },

  portfolioImage: {
    width: '100%',
    height: 120,
    resizeMode: 'cover',
  },

  portfolioInfo: {
    padding: theme.spacing.md,
  },

  portfolioTitle: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semiBold,
    color: theme.colors.white,
    marginBottom: theme.spacing.xs,
  },

  portfolioLocation: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.white + 'CC',
    marginBottom: theme.spacing.xs,
  },

  portfolioPrice: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.error,
  },

  emptyPortfolios: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },

  emptyPortfoliosText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white + 'CC',
    fontStyle: 'italic',
  },
});

export default PublicProfile;
