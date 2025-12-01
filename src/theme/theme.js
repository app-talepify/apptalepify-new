// Centralized theming with dark/light palettes and shared tokens
// Default dark look is preserved
const ACCENT_RED = '#DC143C';
const shared = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xl2: 25,
    xl3: 35,
  },
  fontSizes: {
    xs: 10,
    sm: 11,
    md: 12,
    lg: 13,
    xl: 14,
    xxl: 16,
    xxxl: 18,
  },
  fontWeights: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  opacity: {
    overlayDark: 'rgba(0,0,0,0.6)',
    overlayMedium: 'rgba(0,0,0,0.5)',
    overlayLight: 'rgba(0,0,0,0.3)',
    white08: 'rgba(255,255,255,0.8)',
    white05: 'rgba(255,255,255,0.5)',
    white04: 'rgba(255,255,255,0.4)',
    white03: 'rgba(255,255,255,0.3)',
    black08: 'rgba(0,0,0,0.8)',
    black07: 'rgba(0,0,0,0.7)',
    black06: 'rgba(0,0,0,0.6)',
    black05: 'rgba(0,0,0,0.5)',
    transparent: 'transparent',
  },
};
const dark = {
  colors: {
    background: '#071116',
    surface: '#031015',
    text: '#E6EDF3',
    mutedText: '#9AA4B2',
    border: '#1F2937',
    accent: '#DC143C',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#DC143C',
    white: '#FFFFFF',
    black: '#000000',
    lightGray: '#D3D3D3', // Açık gri
    gray: '#808080', // Koyu gri
    // App-specific tokens
    navy: '#031015',
    navIcon: '#142331',
    // Legacy aliases (for compatibility with existing styles)
    primary: ACCENT_RED,
    cardBg: '#1a2332',
    textWhite: '#FFFFFF',
    textSecondary: '#9AA4B2',
    borderLight: '#1F2937',
    borderDark: '#1F2937',
    inputBg: 'rgba(255,255,255,0.05)',
    inputBorder: 'rgba(255,255,255,0.08)',
    inputText: '#E6EDF3',
    primaryLight: ACCENT_RED + '20',
    progressBg: 'rgba(255,255,255,0.08)',
    progressFill: ACCENT_RED,
    shadow: '#000000',
    overlay: shared.opacity.overlayMedium,
    backdrop: shared.opacity.overlayLight,
    info: '#3b82f6',
    // Component-specific colors
    card: {
      background: '#1a2332',
      border: '#1F2937',
      shadow: 'rgba(0,0,0,0.3)',
      text: '#E6EDF3',
      title: '#FFFFFF',
    },
    button: {
      primary: '#DC143C',
      secondary: '#1F2937',
      text: '#FFFFFF',
      border: '#DC143C',
    },
    header: {
      background: 'transparent',
      text: '#FFFFFF',
      icon: '#FFFFFF',
    },
    taskCard: {
      background: 'linear-gradient(135deg, #0a1420, #0f1a25, #051018)',
      border: '#DC143C',
      shadow: '#DC143C',
      text: '#FFFFFF', // Görev kartı yazıları beyaz
      progressBg: 'rgba(255,255,255,0.1)',
      progressFill: '#DC143C',
    },
    navigation: {
      background: 'rgba(39, 39, 39, 0.8)',
      text: '#FFFFFF',
      active: '#DC143C',
    },
    neumorphism: {
      light: 'rgba(255,255,255,0.1)',
      dark: 'rgba(0,0,0,0.3)',
      background: '#1a2332',
    },
    // Hardcoded renkler için tema değerleri
    crimson: '#DC143C',
    darkGreen: '#010C10', // Koyu yeşil-siyah ton
    glassmorphism: {
      light: 'rgba(255, 255, 255, 0.05)',
      medium: 'rgba(255, 255, 255, 0.08)',
      strong: 'rgba(255, 255, 255, 0.9)',
      border: 'rgba(255, 255, 255, 0.8)',
      background: 'rgba(255, 255, 255, 0.2)',
    },
    shadows: {
      light: 'rgba(0, 0, 0, 0.15)',
      medium: 'rgba(0, 0, 0, 0.3)',
      strong: 'rgba(0,0,0,0.35)',
    },
    borders: {
      light: 'rgba(60, 60, 60, 0.6)',
      crimson: 'rgba(220, 20, 60, 0.3)',
      white: 'rgba(255, 255, 255, 0.3)',
    },
  },
  shadows: {
    small: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    medium: {
      shadowColor: 'rgba(0,0,0,0.3)',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    large: {
      shadowColor: 'rgba(0,0,0,0.4)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
    neumorphism: {
      shadowColor: 'rgba(0,0,0,0.3)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 0,
    },
  },
};
const light = {
  colors: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    text: '#0B1220',
    mutedText: '#475467',
    border: '#E5E7EB',
    accent: ACCENT_RED,
    success: '#16a34a',
    warning: '#d97706',
    error: '#DC143C',
    white: '#FFFFFF',
    black: '#000000',
    lightGray: '#D3D3D3', // Açık gri
    gray: '#808080', // Koyu gri
    // App-specific tokens
    navy: '#142331',
    navIcon: '#142331',
    // Legacy aliases (for compatibility with existing styles)
    primary: ACCENT_RED,
    cardBg: '#FFFFFF',
    textWhite: '#FFFFFF',
    textSecondary: '#475467',
    borderLight: '#E5E7EB',
    borderDark: '#E5E7EB',
    inputBg: '#FFFFFF',
    inputBorder: 'rgba(0,0,0,0.08)',
    inputText: '#0B1220',
    primaryLight: ACCENT_RED + '20',
    progressBg: 'rgba(0,0,0,0.08)',
    progressFill: ACCENT_RED,
    shadow: '#000000',
    overlay: shared.opacity.overlayLight,
    backdrop: shared.opacity.overlayLight,
    info: '#3b82f6',
    // Component-specific colors
    card: {
      background: '#FFFFFF',
      border: '#E5E7EB',
      shadow: 'rgba(0,0,0,0.1)',
      text: '#0B1220',
      title: '#0B1220',
    },
    button: {
      primary: '#DC143C',
      secondary: '#F3F4F6',
      text: '#FFFFFF',
      border: '#DC143C',
    },
    header: {
      background: 'transparent',
      text: '#0B1220',
      icon: '#0B1220',
    },
    taskCard: {
      background: 'linear-gradient(135deg, #f8f9fa, #e9ecef, #dee2e6)',
      border: '#DC143C',
      shadow: '#DC143C',
      text: '#0B1220',
      progressBg: 'rgba(0,0,0,0.1)',
      progressFill: '#DC143C',
    },
    navigation: {
      background: 'rgba(255, 255, 255, 0.8)',
      text: '#0B1220',
      active: '#DC143C',
    },
    neumorphism: {
      light: 'rgba(255,255,255,0.8)',
      dark: 'rgba(0,0,0,0.1)',
      background: '#f5f5f5',
    },
    // Hardcoded renkler için tema değerleri
    crimson: '#DC143C',
    darkGreen: '#010C10', // Koyu yeşil-siyah ton
    glassmorphism: {
      light: 'rgba(0, 0, 0, 0.05)',
      medium: 'rgba(0, 0, 0, 0.08)',
      strong: 'rgba(0, 0, 0, 0.9)',
      border: 'rgba(0, 0, 0, 0.8)',
      background: 'rgba(0, 0, 0, 0.2)',
    },
    shadows: {
      light: 'rgba(0, 0, 0, 0.1)',
      medium: 'rgba(0, 0, 0, 0.2)',
      strong: 'rgba(0,0,0,0.25)',
    },
    borders: {
      light: 'rgba(0, 0, 0, 0.1)',
      crimson: 'rgba(220, 20, 60, 0.3)',
      white: 'rgba(0, 0, 0, 0.3)',
    },
  },
  shadows: {
    small: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    medium: {
      shadowColor: 'rgba(0,0,0,0.1)',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    large: {
      shadowColor: 'rgba(0,0,0,0.15)',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    neumorphism: {
      shadowColor: 'rgba(0,0,0,0.1)',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 0,
    },
  },
};
export const themes = {
  dark: { ...shared, ...dark },
  light: { ...shared, ...light },
};
export const defaultThemeName = 'dark';
// Backward compatibility fallback for legacy imports
export const theme = {
  ...themes[defaultThemeName],
  // Legacy color aliases to avoid breaking existing code during migration
  colors: {
    ...themes[defaultThemeName].colors,
    primary: themes[defaultThemeName].colors.accent,
    cardBg: themes[defaultThemeName].colors.surface,
    textWhite: themes[defaultThemeName].colors.white,
    textSecondary: themes[defaultThemeName].colors.mutedText,
    borderLight: themes[defaultThemeName].colors.border,
    borderDark: themes[defaultThemeName].colors.border,
    inputBg: themes[defaultThemeName].colors.surface,
    inputBorder: themes[defaultThemeName].colors.border,
    inputText: themes[defaultThemeName].colors.text,
    primaryLight: themes[defaultThemeName].colors.accent + '20',
    progressBg: themes[defaultThemeName].colors.border,
    progressFill: themes[defaultThemeName].colors.accent,
    shadow: '#000000',
    overlay: shared.opacity.overlayMedium,
    backdrop: shared.opacity.overlayLight,
  },
};
// Allow ThemeProvider to sync legacy export for components not yet migrated to useTheme
export const setLegacyTheme = (nextTheme) => {
  if (!nextTheme) {
    return;
  }
  // Merge top-level keys
  Object.assign(theme, nextTheme);
  // Merge nested tokens
  theme.colors = { ...theme.colors, ...nextTheme.colors, primary: nextTheme.colors.accent, cardBg: nextTheme.colors.surface, textWhite: nextTheme.colors.white, textSecondary: nextTheme.colors.mutedText, borderLight: nextTheme.colors.border, borderDark: nextTheme.colors.border, inputBg: nextTheme.colors.surface, inputBorder: nextTheme.colors.border, inputText: nextTheme.colors.text, primaryLight: nextTheme.colors.accent + '20', progressBg: nextTheme.colors.border, progressFill: nextTheme.colors.accent, shadow: '#000000', overlay: shared.opacity.overlayMedium, backdrop: shared.opacity.overlayLight };
  theme.shadows = nextTheme.shadows;
  theme.spacing = nextTheme.spacing || theme.spacing;
  theme.borderRadius = nextTheme.borderRadius || theme.borderRadius;
  theme.fontSizes = nextTheme.fontSizes || theme.fontSizes;
  theme.fontWeights = nextTheme.fontWeights || theme.fontWeights;
  theme.opacity = nextTheme.opacity || theme.opacity;
};
