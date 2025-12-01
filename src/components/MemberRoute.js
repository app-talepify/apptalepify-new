import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme/theme';
import PropTypes from 'prop-types';

// Constants
const MEMBER_ROUTE_CONSTANTS = {
  FONT_SIZES: {
    LOADING: 16,
    TITLE: 24,
    TEXT: 16,
  },
  LINE_HEIGHT: 24,
  FONT_WEIGHT: '700',
};

const MESSAGES = {
  LOADING: 'Yükleniyor...',
  UNAUTHORIZED_TITLE: 'Giriş Gerekli',
  UNAUTHORIZED_TEXT: 'Bu sayfayı görüntülemek için giriş yapmanız gerekiyor.',
  FORBIDDEN_TITLE: 'Erişim Reddedildi',
  FORBIDDEN_TEXT: 'Bu sayfa sadece üyeler için erişilebilir.',
};

/**
 * MemberRoute Component
 * Route guard component that protects member-only routes
 * @param {React.ReactNode} children - The content to render if user is a member
 * @param {React.ReactNode} fallback - Custom fallback component to render instead of default messages
 */
const MemberRoute = memo(({ children, fallback }) => {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{MESSAGES.LOADING}</Text>
      </View>
    );
  }

  if (!user) {
    return fallback || (
      <View style={styles.unauthorizedContainer}>
        <Text style={styles.unauthorizedTitle}>{MESSAGES.UNAUTHORIZED_TITLE}</Text>
        <Text style={styles.unauthorizedText}>
          {MESSAGES.UNAUTHORIZED_TEXT}
        </Text>
      </View>
    );
  }

  if (userRole === 'admin' || userRole === 'superadmin') {
    return fallback || (
      <View style={styles.forbiddenContainer}>
        <Text style={styles.forbiddenTitle}>{MESSAGES.FORBIDDEN_TITLE}</Text>
        <Text style={styles.forbiddenText}>
          {MESSAGES.FORBIDDEN_TEXT}
        </Text>
      </View>
    );
  }

  return children;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    fontSize: MEMBER_ROUTE_CONSTANTS.FONT_SIZES.LOADING,
    color: theme.colors.textSecondary,
  },
  unauthorizedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  unauthorizedTitle: {
    fontSize: MEMBER_ROUTE_CONSTANTS.FONT_SIZES.TITLE,
    fontWeight: MEMBER_ROUTE_CONSTANTS.FONT_WEIGHT,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  unauthorizedText: {
    fontSize: MEMBER_ROUTE_CONSTANTS.FONT_SIZES.TEXT,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: MEMBER_ROUTE_CONSTANTS.LINE_HEIGHT,
  },
  forbiddenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  forbiddenTitle: {
    fontSize: MEMBER_ROUTE_CONSTANTS.FONT_SIZES.TITLE,
    fontWeight: MEMBER_ROUTE_CONSTANTS.FONT_WEIGHT,
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
  },
  forbiddenText: {
    fontSize: MEMBER_ROUTE_CONSTANTS.FONT_SIZES.TEXT,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: MEMBER_ROUTE_CONSTANTS.LINE_HEIGHT,
  },
});

// PropTypes
MemberRoute.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node,
};

export default MemberRoute;
