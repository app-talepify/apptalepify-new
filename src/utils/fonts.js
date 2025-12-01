// src/utils/fonts.js
// Poppins font family tanımlamaları

export const Fonts = Object.freeze({
  // Poppins font ailesi
  Poppins: Object.freeze({
    Light: 'Poppins-Light',
    Regular: 'Poppins-Regular',
    Medium: 'Poppins-Medium',
    SemiBold: 'Poppins-SemiBold',
    Bold: 'Poppins-Bold',
  }),

  // Fallback fontlar
  fallback: Object.freeze({
    light: 'System',
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
  }),
});

// Font weight mapping
export const FontWeights = Object.freeze({
  light: '300',
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
});

// Ağırlık normalize edici (case-insensitive ve numeric destekler)
const normalizeWeight = (weight) => {
  const w = String(weight || 'regular').toLowerCase().replace(/\s|-/g, '');
  if (w === '100' || w === 'extralight' || w === 'thin') return 'Light';
  if (w === '200' || w === '300' || w === 'light') return 'Light';
  if (w === '400' || w === 'regular' || w === 'normal') return 'Regular';
  if (w === '500' || w === 'medium') return 'Medium';
  if (w === '600' || w === 'semibold' || w === 'demibold') return 'SemiBold';
  if (w === '700' || w === '800' || w === '900' || w === 'bold' || w === 'extrabold' || w === 'black') return 'Bold';
  return 'Regular';
};

// Platform kontrolü ile font seçimi
export const getFontFamily = (weight = 'regular') => {
  const key = normalizeWeight(weight);
  const fontFamily = Fonts.Poppins[key];
  if (fontFamily) return fontFamily;
  // Fallback: orijinal weight stringine göre, yoksa Regular
  const fb = Fonts.fallback[String(weight || 'regular').toLowerCase()] || Fonts.Poppins.Regular;
  return fb;
};
