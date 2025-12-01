// src/screens/DraftPortfolios.js
// Talepify - Yarıda Kalan Portföyler Sayfası

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  RefreshControl,
  ImageBackground,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';

const DRAFT_STORAGE_KEY = 'talepify.draft.portfolios';

const DraftPortfolios = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const [draftPortfolios, setDraftPortfolios] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Taslak portföyleri yükle
  const loadDraftPortfolios = useCallback(async () => {
    try {
      const drafts = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      if (drafts) {
        let parsedDrafts = [];
        try { parsedDrafts = JSON.parse(drafts); } catch (_) { parsedDrafts = []; }
        const arr = Array.isArray(parsedDrafts) ? parsedDrafts : [];
        // En son güncellenene göre sırala
        const sortedDrafts = arr.sort((a, b) => {
          const aTime = new Date(a?.lastModified || 0).getTime();
          const bTime = new Date(b?.lastModified || 0).getTime();
          return bTime - aTime;
        });
        setDraftPortfolios(sortedDrafts);
      } else {
        setDraftPortfolios([]);
      }
    } catch (error) {
      console.error('Taslak portföyler yüklenirken hata:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDraftPortfolios();
  }, [loadDraftPortfolios]);

  // Yenile
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDraftPortfolios();
    setRefreshing(false);
  }, [loadDraftPortfolios]);

  // Taslağı sil
  const deleteDraft = useCallback(async (draftId) => {
    Alert.alert(
      'Taslağı Sil',
      'Bu taslağı silmek istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedDrafts = draftPortfolios.filter(draft => draft.id !== draftId);
              await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(updatedDrafts));
              setDraftPortfolios(updatedDrafts);
            } catch (error) {
              console.error('Taslak silinirken hata:', error);
            }
          },
        },
      ],
    );
  }, [draftPortfolios]);

  // Taslaktan devam et
  const continueDraft = useCallback((draft) => {
    navigation.navigate('AddPortfolio', {
      previousScreen: 'DraftPortfolios',
      draftData: draft,
      isDraftMode: true,
    });
  }, [navigation]);

  // Adım ismini getir
  const getStepName = (step) => {
    const stepNames = {
      1: 'Temel Bilgiler',
      2: 'Fiyat ve Kredi',
      3: 'Özellikler',
      4: 'Konum Bilgileri',
      5: 'Resimler',
      6: 'Sahip Bilgileri',
    };
    return stepNames[step] || `Adım ${step}`;
  };

  // Tamamlanma yüzdesi
  const getCompletionPercentage = (formData, currentStep) => {
    const totalFields = 15; // Toplam önemli alan sayısı
    let completedFields = 0;

    if (formData.title) completedFields++;
    if (formData.listingStatus) completedFields++;
    if (formData.propertyType) completedFields++;
    if (formData.price) completedFields++;
    if (formData.city) completedFields++;
    if (formData.district) completedFields++;
    if (formData.squareMeters) completedFields++;
    if (formData.roomCount) completedFields++;
    if (formData.bathroomCount) completedFields++;
    if (formData.floorNumber) completedFields++;
    if (formData.buildingAge) completedFields++;
    if (formData.latitude && formData.longitude) completedFields++;
    if (formData.photos && formData.photos.length > 0) completedFields += 2;
    if (formData.ownerName) completedFields++;

    const raw = Math.round((completedFields / totalFields) * 100);
    return Math.min(100, Math.max(0, raw));
  };

  // Tarih formatla
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Az önce';
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays === 1) return 'Dün';
    if (diffDays < 7) return `${diffDays} gün önce`;

    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const styles = StyleSheet.create({
    backgroundImage: {
      flex: 1,
      resizeMode: 'cover',
    },
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    header: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      paddingTop: 30,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
    },
    headerButton: {
      backgroundColor: theme.colors.accent,
      width: 40,
      height: 40,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerIcon: {
      width: 20,
      height: 20,
      resizeMode: 'contain',
      tintColor: theme.colors.white,
    },
    headerTitle: {
      fontSize: theme.fontSizes.xxxl,
      fontWeight: theme.fontWeights.bold,
      color: theme.colors.accent,
      textAlign: 'center',
      flex: 1,
    },
    headerRight: {
      width: 40,
      alignItems: 'flex-end',
    },
    content: {
      flex: 1,
      padding: theme.spacing.lg,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.xl,
    },
    emptyIcon: {
      fontSize: 64,
      marginBottom: theme.spacing.lg,
    },
    emptyTitle: {
      fontSize: theme.fontSizes.xxl,
      fontWeight: theme.fontWeights.bold,
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: theme.spacing.md,
    },
    emptySubtitle: {
      fontSize: theme.fontSizes.lg,
      color: theme.colors.mutedText,
      textAlign: 'center',
      lineHeight: 22,
    },
    draftCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      marginBottom: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
    },
    draftHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
    },
    draftInfo: {
      flex: 1,
      marginRight: theme.spacing.md,
    },
    draftTitle: {
      fontSize: theme.fontSizes.xl,
      fontWeight: theme.fontWeights.semibold,
      color: theme.colors.text,
      marginBottom: theme.spacing.xs,
    },
    draftSubtitle: {
      fontSize: theme.fontSizes.md,
      color: theme.colors.mutedText,
      marginBottom: theme.spacing.xs,
    },
    draftTime: {
      fontSize: theme.fontSizes.sm,
      color: theme.colors.mutedText,
    },
    draftActions: {
      alignItems: 'flex-end',
    },
    deleteButton: {
      padding: theme.spacing.xs,
    },
    deleteIcon: {
      fontSize: 20,
      color: theme.colors.accent,
    },
    progressContainer: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
    },
    progressBar: {
      height: 6,
      backgroundColor: theme.colors.border,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: theme.spacing.xs,
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.colors.accent,
      borderRadius: 3,
    },
    progressText: {
      fontSize: theme.fontSizes.sm,
      color: theme.colors.mutedText,
      textAlign: 'right',
    },
    draftFooter: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    continueButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing.md,
      backgroundColor: theme.colors.accent,
    },
    continueButtonText: {
      color: theme.colors.white,
      fontSize: theme.fontSizes.lg,
      fontWeight: theme.fontWeights.semibold,
      marginRight: theme.spacing.sm,
    },
    continueIcon: {
      fontSize: 16,
      color: theme.colors.white,
    },
  });

  return (
    <ImageBackground
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      style={styles.backgroundImage}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
          >
            <Image
              source={require('../assets/images/icons/return.png')}
              style={styles.headerIcon}
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Taslak Portföyler</Text>

          <View style={styles.headerRight} />
        </View>

        {/* Content */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.accent]}
              tintColor={theme.colors.accent}
            />
          }
        >
          {loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Yükleniyor...</Text>
            </View>
          ) : draftPortfolios.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>Henüz Taslak Yok</Text>
              <Text style={styles.emptySubtitle}>
                Portföy eklerken yarıda bıraktığınız işlemler burada görünecek.
                Böylece kaldığınız yerden devam edebilirsiniz.
              </Text>
            </View>
          ) : (
            draftPortfolios.map((draft) => {
              const completionPercentage = getCompletionPercentage(draft.formData, draft.currentStep);

              return (
                <View key={draft.id} style={styles.draftCard}>
                  {/* Header */}
                  <View style={styles.draftHeader}>
                    <View style={styles.draftInfo}>
                      <Text style={styles.draftTitle}>
                        {draft.formData.title || 'Başlıksız Portföy'}
                      </Text>
                      <Text style={styles.draftSubtitle}>
                        {getStepName(draft.currentStep)} • Adım {draft.currentStep}/6
                      </Text>
                      <Text style={styles.draftTime}>
                        {formatDate(draft.lastModified)}
                      </Text>
                    </View>
                    <View style={styles.draftActions}>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => deleteDraft(draft.id)}
                      >
                        <Text style={styles.deleteIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Progress */}
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${completionPercentage}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>%{completionPercentage} tamamlandı</Text>
                  </View>

                  {/* Footer */}
                  <View style={styles.draftFooter}>
                    <TouchableOpacity
                      style={styles.continueButton}
                      onPress={() => continueDraft(draft)}
                    >
                      <Text style={styles.continueButtonText}>Devam Et</Text>
                      <Text style={styles.continueIcon}>→</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </ImageBackground>
  );
};

export default DraftPortfolios;
