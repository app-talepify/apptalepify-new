// src/screens/ReferralSystem.js
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  ImageBackground,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import GlassmorphismView from '../components/GlassmorphismView';
import { memo } from 'react';
import { useAuth } from '../context/AuthContext';

const ReferralSystem = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { userProfile, getReferralStats, generateReferralCode } = useAuth();
  const [stats, setStats] = useState({
    totalReferrals: 0,
    completedReferrals: 0,
    totalRewardDays: 0,
    referralCode: userProfile?.referralCode || null,
  });
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    const result = await getReferralStats();
    if (result.success) {
      setStats(result.stats);
    } else {
      // Hata durumunda en azından kullanıcının kendi kodunu göster
      setStats(prev => ({ ...prev, referralCode: userProfile?.referralCode || null }));
    }
    setLoading(false);
  }, [getReferralStats, userProfile?.referralCode]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  
  const handleGenerateCode = async () => {
    Alert.alert(
      "Referans Kodu Oluştur",
      "Henüz bir referans kodunuz yok. Şimdi oluşturmak ister misiniz?",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Oluştur",
          onPress: async () => {
            setLoading(true);
            const result = await generateReferralCode();
            if (result.success) {
              setStats(prev => ({ ...prev, referralCode: result.referralCode }));
              Alert.alert("Başarılı!", "Referans kodunuz başarıyla oluşturuldu.");
            }
            setLoading(false);
          },
        },
      ]
    );
  };


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
      return {
        ...commonConfig,
        startColor: 'rgba(255, 255, 255, 1)',
        endColor: 'rgba(230, 230, 230, 0.8)',
        overlayColor: 'rgba(0, 0, 0, 0.05)',
      };
    }
  }, [isDark]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    header: {
      paddingHorizontal: currentTheme.spacing.lg,
      // PortfolioList ile aynı hizalama
      paddingTop: 12,
      paddingBottom: currentTheme.spacing.lg,
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
    },
    content: {
      flex: 1,
      padding: currentTheme.spacing.lg,
      paddingTop: currentTheme.spacing.xxl,
    },
    scrollContent: {
      paddingBottom: insets.bottom + 80, // Bu satırı güncelliyoruz
    },
    backgroundImage: {
      flex: 1,
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
    glassmorphismContainer: {
        overflow: 'hidden',
        borderRadius: currentTheme.borderRadius.lg,
    },
    sectionContent: {
        backgroundColor: 'transparent',
        padding: currentTheme.spacing.lg,
    },
    referralCodeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0,0,0,0.2)',
        padding: currentTheme.spacing.md,
        borderRadius: currentTheme.borderRadius.md,
        marginBottom: currentTheme.spacing.lg,
    },
    referralCode: {
        fontSize: currentTheme.fontSizes.xl,
        fontWeight: currentTheme.fontWeights.bold,
        color: currentTheme.colors.white,
    },
    copyButton: {
        backgroundColor: currentTheme.colors.accent,
        paddingHorizontal: currentTheme.spacing.md,
        paddingVertical: currentTheme.spacing.sm,
        borderRadius: currentTheme.borderRadius.sm,
    },
    copyButtonText: {
        color: currentTheme.colors.white,
        fontWeight: currentTheme.fontWeights.bold,
    },
    infoText: {
        fontSize: currentTheme.fontSizes.md,
        color: currentTheme.colors.mutedText,
        lineHeight: 22,
        textAlign: 'center',
    },
    // New styles for stats
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: currentTheme.spacing.md,
    },
    statCard: {
        alignItems: 'center',
        padding: currentTheme.spacing.sm,
        flex: 1,
    },
    statNumber: {
        fontSize: currentTheme.fontSizes.xxxl,
        fontWeight: currentTheme.fontWeights.bold,
        color: currentTheme.colors.white,
    },
    statLabel: {
        fontSize: currentTheme.fontSizes.sm,
        color: currentTheme.colors.mutedText,
        marginTop: 4,
    },
    // New styles for how it works
    stepContainer: {
        marginTop: currentTheme.spacing.md,
    },
    step: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: currentTheme.spacing.lg,
    },
    stepNumber: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: currentTheme.colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: currentTheme.spacing.md,
    },
    stepNumberText: {
        color: currentTheme.colors.white,
        fontWeight: currentTheme.fontWeights.bold,
    },
    stepContent: {
        flex: 1,
    },
    stepTitle: {
        fontSize: currentTheme.fontSizes.lg,
        fontWeight: currentTheme.fontWeights.semibold,
        color: currentTheme.colors.white,
    },
    stepDescription: {
        fontSize: currentTheme.fontSizes.md,
        color: currentTheme.colors.mutedText,
        marginTop: 4,
    },
    // New styles for benefits
    benefitItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: currentTheme.spacing.md,
    },
    benefitIcon: {
        fontSize: 24,
        marginRight: currentTheme.spacing.md,
    },
    benefitText: {
        fontSize: currentTheme.fontSizes.md,
        color: currentTheme.colors.mutedText,
        flex: 1,
    }
  });

  const referralCode = stats.referralCode;

  const copyToClipboard = () => {
    if (!referralCode) return;
    Clipboard.setString(referralCode);
    Alert.alert("Kopyalandı", "Referans kodu panoya kopyalandı!");
  };

  const shareReferralCode = async () => {
    if (!referralCode) return;
    try {
      await Share.share({
        message: `Talepify uygulamasını benim referans kodumla denemek ister misin? İşte kodun: ${referralCode}\n\nUygulamayı indirmek için: [App Store/Google Play Linki]`,
        title: 'Talepify Daveti',
      });
    } catch (error) {
      Alert.alert("Hata", "Paylaşım sırasında bir sorun oluştu.");
    }
  };

  return (
    <ImageBackground
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => navigation.goBack()}
            >
              <Image
                source={require('../assets/images/icons/return.png')}
                style={styles.headerButtonIconBack}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.headerCenter}>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Referans Sistemi</Text>
              <Text style={styles.headerSubtitle}>Davet kodunla ödüller kazan</Text>
            </View>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Arkadaşını Davet Et</Text>
                <View style={styles.sectionCard}>
                    <GlassmorphismView
                        style={styles.glassmorphismContainer}
                        borderRadius={currentTheme.borderRadius.lg}
                        blurEnabled={false}
                        config={glassmorphismConfig}
                        borderWidth={1}
                        borderColor={currentTheme.colors.border}
                    >
                        <View style={styles.sectionContent}>
                            <Text style={[styles.infoText, { marginBottom: 20 }]}>
                                Arkadaşlarını davet et, hem sen hem de arkadaşın kazansın! Paylaştığın kod ile üye olan her arkadaşın için 30 gün ücretsiz abonelik, arkadaşın için ise ilk aboneliğinde %10 indirim!
                            </Text>
                            {loading ? (
                              <ActivityIndicator size="large" color={currentTheme.colors.white} />
                            ) : referralCode ? (
                              <View style={styles.referralCodeContainer}>
                                <Text style={styles.referralCode}>{referralCode}</Text>
                                <View style={{flexDirection: 'row'}}>
                                  <TouchableOpacity style={[styles.copyButton, { marginRight: 10 }]} onPress={copyToClipboard}>
                                      <Text style={styles.copyButtonText}>Kopyala</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity style={styles.copyButton} onPress={shareReferralCode}>
                                      <Text style={styles.copyButtonText}>Paylaş</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ) : (
                              <TouchableOpacity style={styles.copyButton} onPress={handleGenerateCode}>
                                <Text style={styles.copyButtonText}>Referans Kodu Oluştur</Text>
                              </TouchableOpacity>
                            )}
                        </View>
                    </GlassmorphismView>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Referans İstatistikleri</Text>
                <View style={styles.sectionCard}>
                    <GlassmorphismView
                        style={styles.glassmorphismContainer}
                        borderRadius={currentTheme.borderRadius.lg}
                        blurEnabled={false}
                        config={glassmorphismConfig}
                        borderWidth={1}
                        borderColor={currentTheme.colors.border}
                    >
                        <View style={styles.sectionContent}>
                            <View style={styles.statsGrid}>
                                <View style={styles.statCard}>
                                    <Text style={styles.statNumber}>{loading ? '...' : stats.totalReferrals}</Text>
                                    <Text style={styles.statLabel}>Toplam Davet</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statNumber}>{loading ? '...' : stats.completedReferrals}</Text>
                                    <Text style={styles.statLabel}>Başarılı</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statNumber}>{loading ? '...' : stats.totalRewardDays}</Text>
                                    <Text style={styles.statLabel}>Kazanılan Gün</Text>
                                </View>
                            </View>
                        </View>
                    </GlassmorphismView>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Nasıl Çalışır?</Text>
                <View style={styles.sectionCard}>
                    <GlassmorphismView
                        style={styles.glassmorphismContainer}
                        borderRadius={currentTheme.borderRadius.lg}
                        blurEnabled={false}
                        config={glassmorphismConfig}
                        borderWidth={1}
                        borderColor={currentTheme.colors.border}
                    >
                        <View style={styles.sectionContent}>
                           <View style={styles.stepContainer}>
                             <View style={styles.step}>
                               <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                               <View style={styles.stepContent}>
                                 <Text style={styles.stepTitle}>Referans Kodunu Paylaş</Text>
                                 <Text style={styles.stepDescription}>Arkadaşlarını davet etmek için kişisel kodunu paylaş.</Text>
                               </View>
                             </View>
                             <View style={styles.step}>
                               <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                               <View style={styles.stepContent}>
                                 <Text style={styles.stepTitle}>Arkadaşın Üye Olsun</Text>
                                 <Text style={styles.stepDescription}>Arkadaşın senin kodunla kayıt olduğunda ilk adımı tamamlarsınız.</Text>
                               </View>
                             </View>
                             <View style={styles.step}>
                               <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                               <View style={styles.stepContent}>
                                 <Text style={styles.stepTitle}>Abonelik Başlatsın (%10 İndirimle!)</Text>
                                 <Text style={styles.stepDescription}>Arkadaşın ücretli bir abonelik başlattığında hem o %10 indirim kazanır, hem de sen ödül kazanırsın.</Text>
                               </View>
                             </View>
                             <View style={styles.step}>
                               <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
                               <View style={styles.stepContent}>
                                 <Text style={styles.stepTitle}>Ödülünü Kazan</Text>
                                 <Text style={styles.stepDescription}>Her başarılı davet için 30 gün ücretsiz kullanım hesabına eklensin.</Text>
                               </View>
                             </View>
                           </View>
                        </View>
                    </GlassmorphismView>
                </View>
            </View>

             <View style={styles.section}>
                <Text style={styles.sectionTitle}>Referans Avantajları</Text>
                <View style={styles.sectionCard}>
                    <GlassmorphismView
                        style={styles.glassmorphismContainer}
                        borderRadius={currentTheme.borderRadius.lg}
                        blurEnabled={false}
                        config={glassmorphismConfig}
                        borderWidth={1}
                        borderColor={currentTheme.colors.border}
                    >
                        <View style={styles.sectionContent}>
                            <View style={styles.benefitItem}>
                                <Text style={styles.benefitIcon}>🎁</Text>
                                <Text style={styles.benefitText}>Her başarılı referans için 30 gün ek abonelik süresi</Text>
                            </View>
                            <View style={styles.benefitItem}>
                                <Text style={styles.benefitIcon}>♾️</Text>
                                <Text style={styles.benefitText}>Sınırsız sayıda arkadaşını davet et, daha çok kazan</Text>
                            </View>
                            <View style={styles.benefitItem}>
                                <Text style={styles.benefitIcon}>💰</Text>
                                <Text style={styles.benefitText}>Ekstra hiçbir ücret ödemeden kazancını artır</Text>
                            </View>
                             <View style={styles.benefitItem}>
                                <Text style={styles.benefitIcon}>📈</Text>
                                <Text style={styles.benefitText}>Kolayca referanslarını takip et ve kazancını gör</Text>
                            </View>
                        </View>
                    </GlassmorphismView>
                </View>
            </View>

        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
};

export default memo(ReferralSystem);
