import { Dimensions, Platform } from 'react-native';

// Baseline (iPhone 12/14 Pro benzeri)
const { width, height } = Dimensions.get('window');
const BASE_WIDTH = 390;  // 390x844 default
const BASE_HEIGHT = 844;

// Yatay ölçek
const s = (size) => (width / BASE_WIDTH) * size;
// Dikey ölçek
const vs = (size) => (height / BASE_HEIGHT) * size;
// Yumuşatılmış ölçek (aşırı büyümeyi önler)
const ms = (size, factor = 0.5) => {
	const scaled = s(size);
	return size + (scaled - size) * factor;
};
// Sınırla
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
// Font ölçeği (tabletlerde aşırı büyümeyi sınırla)
const font = (size, factor = 0.5, { min = 11, max = 24 } = {}) =>
	clamp(ms(size, factor), min, max);

export { s, vs, ms, font, clamp };


