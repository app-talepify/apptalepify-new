import { StyleSheet } from 'react-native';

// Dev-only log helpers
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

/**
 * Tema tabanlı stil oluşturucu helper fonksiyonu
 * @param {Function} styleFunction - Tema parametresi alan ve stil objesi dönen fonksiyon
 * @returns {Function} useTheme hook'u ile kullanılacak fonksiyon
 */
export const createThemedStyles = (styleFunction) => {
  return (theme) => {
    try {
      const result = typeof styleFunction === 'function' ? styleFunction(theme || {}) : {};
      return StyleSheet.create(result && typeof result === 'object' ? result : {});
    } catch (e) {
      devWarn('createThemedStyles error:', e?.message || e);
      return StyleSheet.create({});
    }
  };
};

/**
 * Tema renklerini kolayca erişmek için helper fonksiyon
 * @param {Object} theme - Tema objesi
 * @param {string} path - Renk yolu (örn: 'card.background', 'button.primary')
 * @returns {string} Renk değeri
 */
export const getThemeColor = (theme, path) => {
  const keys = String(path || '').split('.');
  const colors = theme && theme.colors ? theme.colors : null;
  if (!colors) {
    devWarn(`Theme colors not available for path: ${path}`);
    return '#000000';
  }
  let value = colors;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      devWarn(`Theme color not found: ${path}`);
      return '#000000'; // Fallback color
    }
  }

  return value;
};

/**
 * Component stil objesi oluşturucu
 * @param {Object} theme - Tema objesi
 * @param {string} componentName - Component adı
 * @returns {Object} Component stil objesi
 */
export const getComponentStyles = (theme, componentName) => {
  const components = theme && theme.components ? theme.components : null;
  if (!components) {
    return {};
  }
  return components[componentName] || {};
};

/**
 * Neumorphism stil oluşturucu
 * @param {Object} theme - Tema objesi
 * @param {Object} options - Neumorphism seçenekleri
 * @returns {Object} Neumorphism stil objesi
 */
export const createNeumorphismStyle = (theme, options = {}) => {
  const {
    borderRadius = 20,
    padding = 25,
    marginTop = 5,
    marginBottom = 20,
    marginHorizontal = 7,
    minHeight = 240,
  } = options;

  const colors = theme?.colors || {};
  const neumorphism = colors?.neumorphism || {};
  const card = colors?.card || {};

  return {
    borderRadius,
    padding,
    marginTop,
    marginBottom,
    marginHorizontal,
    minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neumorphism.background || '#FFFFFF',
    borderWidth: 1,
    borderColor: card.border || '#E5E7EB',
    // Neumorphism gölge efekti
    shadowColor: neumorphism.dark || 'rgba(0,0,0,0.2)',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 0,
  };
};

/**
 * Gradient renkleri oluşturucu
 * @param {Object} theme - Tema objesi
 * @param {string} gradientType - Gradient tipi ('taskCard', 'neumorphism', vb.)
 * @returns {Array} Gradient renkleri dizisi
 */
export const getGradientColors = (theme, gradientType) => {
  const gradients = {
    taskCard: {
      dark: ['#050505', '#1a1a1a', '#050505'],
      light: ['#f8f9fa', '#e9ecef', '#dee2e6'],
    },
    neumorphism: {
      dark: ['rgba(0, 0, 0, 0.17)', 'rgba(55, 31, 31, 0.56)'],
      light: ['#f5f5f5', '#e5e7eb'],
    },
    card: {
      dark: ['#0E1A25', '#1F2937'],
      light: ['#FFFFFF', '#F9FAFB'],
    },
  };

  const isDark = theme?.colors?.background === '#142331';
  const type = gradients[gradientType];
  if (!type) {
    return ['#000000', '#FFFFFF'];
  }
  return type[isDark ? 'dark' : 'light'] || ['#000000', '#FFFFFF'];
};

export default {
  createThemedStyles,
  getThemeColor,
  getComponentStyles,
  createNeumorphismStyle,
  getGradientColors,
};
