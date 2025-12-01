import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  ImageBackground,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { memo } from 'react';
import GlassmorphismView from '../components/GlassmorphismView';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ_DATA = [
  {
    question: 'Aboneliğimi nasıl iptal edebilirim?',
    answer: 'Aboneliğinizi iptal etmek için Ayarlar > Abonelik Yönetimi sayfasını ziyaret edebilir ve oradaki adımları takip edebilirsiniz. Mevcut aboneliğiniz, fatura döneminizin sonuna kadar devam edecektir.',
  },
  {
    question: 'Referans kodu nasıl oluşturulur?',
    answer: 'Uygulama içinde Profil sekmesi altındaki "Referans Sistemi" sayfasına giderek size özel referans kodunuzu oluşturabilir ve arkadaşlarınızla paylaşmaya başlayabilirsiniz.',
  },
  {
    question: 'Şifremi unuttum, ne yapmalıyım?',
    answer: 'Giriş ekranında bulunan "Şifremi Unuttum" bağlantısına tıklayarak şifre sıfırlama adımlarını takip edebilirsiniz. E-posta adresinize bir sıfırlama bağlantısı gönderilecektir.',
  },
];

const FaqItem = ({ item, isExpanded, onPress }) => {
    const { theme: currentTheme } = useTheme();
    const styles = useMemo(() => createFaqStyles(currentTheme), [currentTheme]);

    return (
        <View style={styles.faqItemContainer}>
            <TouchableOpacity onPress={onPress} style={styles.faqQuestionContainer} activeOpacity={0.8}>
                <Text style={styles.faqQuestionText}>{item.question}</Text>
                <Image source={require('../assets/images/icons/return.png')} style={[styles.faqArrow, isExpanded && styles.faqArrowExpanded]} />
            </TouchableOpacity>
            {isExpanded && (
                <View style={styles.faqAnswerContainer}>
                    <Text style={styles.faqAnswerText}>{item.answer}</Text>
                </View>
            )}
        </View>
    );
}

const HelpAndSupport = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [expandedFaq, setExpandedFaq] = useState(null);

  const toggleFaq = (index) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFaq(expandedFaq === index ? null : index);
  };
  
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

  const styles = useMemo(() => createStyles(currentTheme, isDark, insets), [currentTheme, isDark, insets]);

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
              <Text style={styles.headerTitle}>Yardım & Destek</Text>
              <Text style={styles.headerSubtitle}>Soruların için hızlı destek al</Text>
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
                    <Text style={styles.sectionTitle}>Anında Yardım Alın</Text>
                    <Text style={styles.paragraph}>
                        Aklınıza takılan bir soru mu var veya bir sorun mu yaşıyorsunuz? Destek ekibimizle anında iletişime geçin.
                    </Text>
                    <TouchableOpacity style={styles.supportButton} onPress={() => navigation.navigate('LiveChat')}>
                        <Text style={styles.supportButtonText}>Canlı Desteğe Bağlan</Text>
                    </TouchableOpacity>
                </View>
            </GlassmorphismView>
          </View>
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
                    <Text style={styles.sectionTitle}>Sıkça Sorulan Sorular</Text>
                    {FAQ_DATA.map((item, index) => (
                        <FaqItem 
                            key={index} 
                            item={item} 
                            isExpanded={expandedFaq === index} 
                            onPress={() => toggleFaq(index)} 
                        />
                    ))}
                </View>
            </GlassmorphismView>
          </View>
        </ScrollView>

      </SafeAreaView>
    </ImageBackground>
  );
};

const createStyles = (currentTheme, isDark, insets) => StyleSheet.create({
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
    headerRight: {
      width: 40,
    },
    headerSubtitle: {
      marginTop: 4,
      fontSize: 12,
      color: currentTheme.colors.mutedText,
      textAlign: 'center',
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
        color: '#FFFFFF',
        marginBottom: currentTheme.spacing.md,
    },
    paragraph: {
        fontSize: currentTheme.fontSizes.md,
        color: 'rgba(255, 255, 255, 0.85)',
        lineHeight: 22,
        marginBottom: currentTheme.spacing.lg,
    },
    supportButton: {
        backgroundColor: currentTheme.colors.accent,
        paddingVertical: currentTheme.spacing.md,
        borderRadius: currentTheme.borderRadius.md,
        alignItems: 'center',
        marginTop: currentTheme.spacing.sm,
    },
    supportButtonText: {
        color: currentTheme.colors.white,
        fontSize: currentTheme.fontSizes.lg,
        fontWeight: 'bold',
    },
    webviewLoading: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Modal Styles
    modalContainer: {
        flex: 1,
        backgroundColor: isDark ? '#0f172a' : '#fff',
    },
    modalHeader: {
        height: 60,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: currentTheme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: currentTheme.colors.border,
        backgroundColor: isDark ? '#1a2a3a' : '#f8f8f8',
    },
    modalHeaderText: {
        fontSize: currentTheme.fontSizes.xl,
        fontWeight: 'bold',
        color: isDark ? currentTheme.colors.white : currentTheme.colors.text,
    },
    modalCloseButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: currentTheme.borderRadius.md,
        backgroundColor: currentTheme.colors.error,
    },
    modalCloseButtonText: {
        color: currentTheme.colors.white,
        fontWeight: 'bold',
        fontSize: currentTheme.fontSizes.md,
    }
});

const createFaqStyles = (currentTheme) => StyleSheet.create({
    faqItemContainer: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    faqQuestionContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: currentTheme.spacing.md,
    },
    faqQuestionText: {
        flex: 1,
        fontSize: currentTheme.fontSizes.lg,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    faqArrow: {
        width: 14,
        height: 14,
        tintColor: 'rgba(255, 255, 255, 0.7)',
        transform: [{ rotate: '-90deg' }],
    },
    faqArrowExpanded: {
        transform: [{ rotate: '90deg' }],
    },
    faqAnswerContainer: {
        paddingBottom: currentTheme.spacing.md,
    },
    faqAnswerText: {
        paddingTop: currentTheme.spacing.sm,
        fontSize: currentTheme.fontSizes.md,
        color: 'rgba(255, 255, 255, 0.85)',
        lineHeight: 20,
    },
});


export default memo(HelpAndSupport);
