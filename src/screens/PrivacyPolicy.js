import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  ImageBackground,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { memo } from 'react';
import GlassmorphismView from '../components/GlassmorphismView';
import { PRIVACY_CONTACT_EMAIL } from '@env';

const PrivacyPolicy = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const glassmorphismConfig = useMemo(() => {
    if (isDark) {
      return {
        startColor: 'rgba(17, 36, 49, 1)',
        endColor: 'rgba(17, 36, 49, 0.64)',
      };
    } else {
      return {
        startColor: 'rgba(255, 255, 255, 1)',
        endColor: 'rgba(230, 230, 230, 0.8)',
        overlayColor: 'rgba(0, 0, 0, 0.05)',
      };
    }
  }, [isDark]);

  const styles = useMemo(() => StyleSheet.create({
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
    },
    scrollContent: {
      paddingBottom: insets.bottom + 80,
    },
    backgroundImage: {
      flex: 1,
    },
    section: {
        marginBottom: currentTheme.spacing.lg,
    },
    glassmorphismContainer: {
        borderRadius: currentTheme.borderRadius.lg,
        overflow: 'hidden',
    },
    cardContent: {
        padding: currentTheme.spacing.lg,
        backgroundColor: 'transparent',
    },
    sectionTitle: {
        fontSize: currentTheme.fontSizes.xl,
        fontWeight: 'bold',
        color: isDark ? '#FFFFFF' : currentTheme.colors.text,
        marginTop: currentTheme.spacing.lg,
        marginBottom: currentTheme.spacing.sm,
    },
    paragraph: {
        fontSize: currentTheme.fontSizes.md,
        color: isDark ? 'rgba(255, 255, 255, 0.85)' : currentTheme.colors.text,
        lineHeight: 22,
        marginBottom: currentTheme.spacing.md,
    },
    emailButton: {
      marginTop: currentTheme.spacing.sm,
      alignSelf: 'flex-start',
      backgroundColor: currentTheme.colors.primary,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    emailButtonText: {
      color: currentTheme.colors.white,
      fontWeight: '600',
    },
  }), [currentTheme, isDark, insets]);

  return (
    <ImageBackground
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      style={styles.backgroundImage}
    >
      <SafeAreaView style={styles.container}>
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
              <Text style={styles.headerTitle}>Gizlilik Politikası</Text>
              <Text style={styles.headerSubtitle}>Veri kullanımımız ve koruma ilkeleri</Text>
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
            <GlassmorphismView
                style={styles.glassmorphismContainer}
                config={glassmorphismConfig}
                borderRadius={currentTheme.borderRadius.lg}
                borderWidth={1}
                borderColor={currentTheme.colors.border}
                blurEnabled={false}
            >
                <View style={styles.cardContent}>
                    <Text style={styles.paragraph}>Son Güncelleme: 24 Ekim 2025</Text>
                    
                    <Text style={styles.sectionTitle}>1. Giriş</Text>
                    <Text style={styles.paragraph}>
                        Talepify ("biz", "bize", "bizim") olarak gizliliğinize önem veriyoruz. Bu gizlilik politikası, mobil uygulamamız aracılığıyla hangi kişisel verileri topladığımızı, bu verileri nasıl kullandığımızı ve koruduğumuzu açıklamaktadır.
                    </Text>

                    <Text style={styles.sectionTitle}>2. Topladığımız Bilgiler</Text>
                    <Text style={styles.paragraph}>
                        - Hesap Bilgileri: Kayıt sırasında adınız, telefon numaranız, e-posta adresiniz ve şifreniz gibi bilgileri toplarız.
                        - Profil Bilgileri: Ofis adı, şehir ve profil resmi gibi ek bilgileri profilinize ekleyebilirsiniz.
                        - Kullanım Verileri: Uygulama içindeki etkileşimleriniz, oluşturduğunuz portföyler ve talepler gibi verileri hizmet kalitemizi artırmak amacıyla toplarız.
                    </Text>

                    <Text style={styles.sectionTitle}>3. Bilgilerin Kullanımı</Text>
                    <Text style={styles.paragraph}>
                        Topladığımız bilgileri şu amaçlarla kullanırız:
                        - Hizmetlerimizi sunmak ve yönetmek.
                        - Hesabınızı doğrulamak ve güvenliği sağlamak.
                        - Uygulama deneyiminizi kişiselleştirmek.
                        - Size güncellemeler, promosyonlar ve bildirimler göndermek.
                        - Yasal yükümlülüklerimize uymak.
                    </Text>

                    <Text style={styles.sectionTitle}>4. Bilgilerin Paylaşımı</Text>
                    <Text style={styles.paragraph}>
                        Kişisel bilgilerinizi, yasal bir zorunluk olmadıkça veya sizin izniniz olmadan üçüncü taraflarla paylaşmayız. Hizmetlerimizi sunmak için çalıştığımız iş ortaklarımız (örneğin, sunucu sağlayıcıları) bu bilgilere sınırlı erişime sahip olabilir, ancak bu erişim katı gizlilik anlaşmalarıyla korunmaktadır.
                    </Text>

                    <Text style={styles.sectionTitle}>5. Güvenlik</Text>
                    <Text style={styles.paragraph}>
                        Verilerinizin güvenliğini sağlamak için endüstri standardı teknik ve idari güvenlik önlemleri alıyoruz. Ancak, internet üzerinden hiçbir iletim yönteminin veya elektronik depolama yönteminin %100 güvenli olmadığını unutmamanız önemlidir.
                    </Text>

                    <Text style={styles.sectionTitle}>6. Politikadaki Değişiklikler</Text>
                    <Text style={styles.paragraph}>
                        Bu gizlilik politikasını zaman zaman güncelleyebiliriz. Değişiklikler bu sayfada yayınlandığı andan itibaren geçerli olacaktır. Politikadaki önemli değişiklikleri size bildireceğiz.
                    </Text>

                    <Text style={styles.sectionTitle}>7. İletişim</Text>
                    <Text style={styles.paragraph}>
                        Gizlilik politikamızla ilgili herhangi bir sorunuz veya endişeniz varsa bizimle e-posta üzerinden iletişime geçebilirsiniz.
                    </Text>
                    <TouchableOpacity
                      style={styles.emailButton}
                      onPress={() => {
                        const email = PRIVACY_CONTACT_EMAIL || 'info@talepify.com';
                        try { Linking.openURL(`mailto:${email}`); } catch {}
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="E-posta ile iletişime geç"
                    >
                      <Text style={styles.emailButtonText}>
                        {PRIVACY_CONTACT_EMAIL || 'info@talepify.com'}
                      </Text>
                    </TouchableOpacity>
                </View>
            </GlassmorphismView>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
};

export default memo(PrivacyPolicy);
