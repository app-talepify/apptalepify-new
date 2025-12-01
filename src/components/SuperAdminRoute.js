import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme/theme';
import PropTypes from 'prop-types';

// Constants
const SUPER_ADMIN_ROUTE_CONSTANTS = {
  FONT_SIZES: {
    LOADING: 16,
    TITLE: 24,
    TEXT: 16,
    SUBTEXT: 14,
  },
  LINE_HEIGHT: 24,
  FONT_WEIGHT: '700',
  SUBTEXT_FONT_WEIGHT: '600',
};

const MESSAGES = {
  LOADING: 'Yükleniyor...',
  UNAUTHORIZED_TITLE: 'Giriş Gerekli',
  UNAUTHORIZED_TEXT: 'Bu sayfayı görüntülemek için giriş yapmanız gerekiyor.',
  FORBIDDEN_TITLE: 'Yetkisiz Erişim',
  FORBIDDEN_TEXT: 'Bu sayfa sadece süper yöneticiler için erişilebilir.',
  FORBIDDEN_SUBTEXT: 'Mevcut rolünüz:',
  ROLE_ADMIN: 'Yönetici',
  ROLE_MEMBER: 'Üye',
};

const USER_ROLES = {
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
  MEMBER: 'member',
};

/**
 * SuperAdminRoute Component
 * Route guard component that protects super admin-only routes
 * @param {React.ReactNode} children - The content to render if user is a super admin
 * @param {React.ReactNode} fallback - Custom fallback component to render instead of default messages
 */
const SuperAdminRoute = memo(({ children, fallback }) => {
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

  if (userRole !== USER_ROLES.SUPER_ADMIN) {
    return fallback || (
      <View style={styles.forbiddenContainer}>
        <Text style={styles.forbiddenTitle}>{MESSAGES.FORBIDDEN_TITLE}</Text>
        <Text style={styles.forbiddenText}>
          {MESSAGES.FORBIDDEN_TEXT}
        </Text>
        <Text style={styles.forbiddenSubtext}>
          {MESSAGES.FORBIDDEN_SUBTEXT} {userRole === USER_ROLES.ADMIN ? MESSAGES.ROLE_ADMIN : MESSAGES.ROLE_MEMBER}
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
    fontSize: SUPER_ADMIN_ROUTE_CONSTANTS.FONT_SIZES.LOADING,
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
    fontSize: SUPER_ADMIN_ROUTE_CONSTANTS.FONT_SIZES.TITLE,
    fontWeight: SUPER_ADMIN_ROUTE_CONSTANTS.FONT_WEIGHT,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  unauthorizedText: {
    fontSize: SUPER_ADMIN_ROUTE_CONSTANTS.FONT_SIZES.TEXT,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: SUPER_ADMIN_ROUTE_CONSTANTS.LINE_HEIGHT,
  },
  forbiddenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  forbiddenTitle: {
    fontSize: SUPER_ADMIN_ROUTE_CONSTANTS.FONT_SIZES.TITLE,
    fontWeight: SUPER_ADMIN_ROUTE_CONSTANTS.FONT_WEIGHT,
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
  },
  forbiddenText: {
    fontSize: SUPER_ADMIN_ROUTE_CONSTANTS.FONT_SIZES.TEXT,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: SUPER_ADMIN_ROUTE_CONSTANTS.LINE_HEIGHT,
    marginBottom: theme.spacing.sm,
  },
  forbiddenSubtext: {
    fontSize: SUPER_ADMIN_ROUTE_CONSTANTS.FONT_SIZES.SUBTEXT,
    color: theme.colors.primary,
    fontWeight: SUPER_ADMIN_ROUTE_CONSTANTS.SUBTEXT_FONT_WEIGHT,
  },
});

// PropTypes
SuperAdminRoute.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node,
};

export default SuperAdminRoute;
