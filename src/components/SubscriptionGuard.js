import React, { useState, useEffect, memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import trialManager from '../utils/trialManager';
import { theme } from '../theme/theme';
import PropTypes from 'prop-types';

// Constants
const SUBSCRIPTION_GUARD_CONSTANTS = {
  MODAL: {
    BORDER_RADIUS: 20,
    PADDING: 24,
    MARGIN: 20,
    WIDTH: '90%',
    MAX_WIDTH: 400,
    OVERLAY_OPACITY: 'rgba(0, 0, 0, 0.5)',
  },
  FONT_SIZES: {
    LOADING: 16,
    TITLE: 22,
    SUBTITLE: 16,
    TEXT: 16,
    BUTTON: 16,
  },
  SPACING: {
    MODAL_HEADER_MARGIN: 20,
    MODAL_BODY_MARGIN: 24,
    MODAL_ACTIONS_GAP: 12,
    BUTTON_PADDING: 16,
    TITLE_MARGIN: 8,
    LINE_HEIGHT: 22,
    TEXT_LINE_HEIGHT: 24,
  },
  BORDER_RADIUS: {
    MODAL: 20,
    BUTTON: 12,
  },
  FONT_WEIGHTS: {
    TITLE: 'bold',
    BUTTON: '600',
    CLOSE_BUTTON: '500',
  },
};

const MODAL_MESSAGES = {
  LOADING: 'Kontrol ediliyor...',
  TITLE: 'Deneme Sürümü Sona Erdi',
  SUBTITLE: 'Tüm özelliklere erişmek için abonelik paketlerini inceleyin',
  FEATURES: '• Sınırsız portföy ekleme\n• Gelişmiş eşleştirme algoritması\n• Öncelikli destek\n• Detaylı analitik raporlar\n• API erişimi',
  UPGRADE_BUTTON: 'Paketleri İncele',
  CLOSE_BUTTON: 'Daha Sonra',
};

/**
 * SubscriptionGuard Component
 * Guards routes that require active subscription or trial
 * @param {React.ReactNode} children - The content to render if subscription is active
 * @param {boolean} showTrialExpired - Whether to show trial expired modal
 */
const SubscriptionGuard = memo(({ children, showTrialExpired = true }) => {
  const navigation = useNavigation();
  const [trialStatus, setTrialStatus] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkSubscriptionStatus = useCallback(async () => {
    try {
      setLoading(true);
      const status = await trialManager.getTrialStatus();
      setTrialStatus(status);

      // Deneme sürümü süresi dolmuş mu kontrol et
      if (status.hasTrial && !status.isActive && showTrialExpired) {
        setShowModal(true);
      }
    } catch (error) {
      // Silent error handling
    } finally {
      setLoading(false);
    }
  }, [showTrialExpired]);

  useEffect(() => {
    checkSubscriptionStatus();
  }, [checkSubscriptionStatus]);

  const handleUpgrade = useCallback(() => {
    setShowModal(false);
    navigation.navigate('Subscription');
  }, [navigation]);

  const handleClose = useCallback(() => {
    setShowModal(false);
  }, []);

  // Yükleniyor: İçeriği hemen göster, kontrol arka planda tamamlansın
  if (loading) {
    return children;
  }

  // Deneme sürümü aktif veya abonelik varsa içeriği göster
  if (trialStatus?.isActive || trialStatus?.hasSubscription) {
    return children;
  }

  // Deneme sürümü süresi dolmuşsa modal göster
  if (showModal && trialStatus?.hasTrial && !trialStatus?.isActive) {
    return (
      <>
        {children}
        <Modal
          visible={showModal}
          transparent={true}
          animationType="fade"
          onRequestClose={handleClose}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{MODAL_MESSAGES.TITLE}</Text>
                <Text style={styles.modalSubtitle}>
                  {MODAL_MESSAGES.SUBTITLE}
                </Text>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.modalText}>
                  {MODAL_MESSAGES.FEATURES}
                </Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={handleUpgrade}
                >
                  <Text style={styles.upgradeButtonText}>{MODAL_MESSAGES.UPGRADE_BUTTON}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={handleClose}
                >
                  <Text style={styles.closeButtonText}>{MODAL_MESSAGES.CLOSE_BUTTON}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  // Hiç abonelik yoksa normal içeriği göster
  return children;
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    fontSize: SUBSCRIPTION_GUARD_CONSTANTS.FONT_SIZES.LOADING,
    color: theme.colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: SUBSCRIPTION_GUARD_CONSTANTS.MODAL.OVERLAY_OPACITY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: SUBSCRIPTION_GUARD_CONSTANTS.MODAL.BORDER_RADIUS,
    padding: SUBSCRIPTION_GUARD_CONSTANTS.MODAL.PADDING,
    margin: SUBSCRIPTION_GUARD_CONSTANTS.MODAL.MARGIN,
    width: SUBSCRIPTION_GUARD_CONSTANTS.MODAL.WIDTH,
    maxWidth: SUBSCRIPTION_GUARD_CONSTANTS.MODAL.MAX_WIDTH,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: SUBSCRIPTION_GUARD_CONSTANTS.SPACING.MODAL_HEADER_MARGIN,
  },
  modalTitle: {
    fontSize: SUBSCRIPTION_GUARD_CONSTANTS.FONT_SIZES.TITLE,
    fontWeight: SUBSCRIPTION_GUARD_CONSTANTS.FONT_WEIGHTS.TITLE,
    color: theme.colors.text,
    marginBottom: SUBSCRIPTION_GUARD_CONSTANTS.SPACING.TITLE_MARGIN,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: SUBSCRIPTION_GUARD_CONSTANTS.FONT_SIZES.SUBTITLE,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: SUBSCRIPTION_GUARD_CONSTANTS.SPACING.LINE_HEIGHT,
  },
  modalBody: {
    marginBottom: SUBSCRIPTION_GUARD_CONSTANTS.SPACING.MODAL_BODY_MARGIN,
  },
  modalText: {
    fontSize: SUBSCRIPTION_GUARD_CONSTANTS.FONT_SIZES.TEXT,
    color: theme.colors.text,
    lineHeight: SUBSCRIPTION_GUARD_CONSTANTS.SPACING.TEXT_LINE_HEIGHT,
  },
  modalActions: {
    gap: SUBSCRIPTION_GUARD_CONSTANTS.SPACING.MODAL_ACTIONS_GAP,
  },
  upgradeButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: SUBSCRIPTION_GUARD_CONSTANTS.SPACING.BUTTON_PADDING,
    borderRadius: SUBSCRIPTION_GUARD_CONSTANTS.BORDER_RADIUS.BUTTON,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: theme.colors.white,
    fontSize: SUBSCRIPTION_GUARD_CONSTANTS.FONT_SIZES.BUTTON,
    fontWeight: SUBSCRIPTION_GUARD_CONSTANTS.FONT_WEIGHTS.BUTTON,
  },
  closeButton: {
    backgroundColor: 'transparent',
    paddingVertical: SUBSCRIPTION_GUARD_CONSTANTS.SPACING.BUTTON_PADDING,
    borderRadius: SUBSCRIPTION_GUARD_CONSTANTS.BORDER_RADIUS.BUTTON,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  closeButtonText: {
    color: theme.colors.textSecondary,
    fontSize: SUBSCRIPTION_GUARD_CONSTANTS.FONT_SIZES.BUTTON,
    fontWeight: SUBSCRIPTION_GUARD_CONSTANTS.FONT_WEIGHTS.CLOSE_BUTTON,
  },
});

// PropTypes
SubscriptionGuard.propTypes = {
  children: PropTypes.node.isRequired,
  showTrialExpired: PropTypes.bool,
};

export default SubscriptionGuard;
