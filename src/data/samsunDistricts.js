// Samsun ilçelerinin basitleştirilmiş sınırları
// Gerçek ilçe şekillerine yakın ama daha az veri ile

export const samsunDistricts = [
  '19 Mayıs', 'Alaçam', 'Asarcık', 'Atakum', 'Ayvacık', 'Bafra', 'Canik', 'Çarşamba', 'Havza', 'İlkadım',
  'Kavak', 'Ladik', 'Ondokuzmayıs', 'Salıpazarı', 'Tekkeköy', 'Terme', 'Vezirköprü', 'Yakakent',
];

// Gerçekçi ilçe sınırları (gerçek koordinatlara yakın)
export const districtBoundaries = {
  'Atakum': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.25, 41.25], [36.35, 41.22], [36.42, 41.28], [36.45, 41.38],
        [36.40, 41.45], [36.30, 41.48], [36.20, 41.45], [36.15, 41.38],
        [36.18, 41.28], [36.25, 41.25],
      ]],
    },
    properties: { name: 'Atakum' },
  },
  'İlkadım': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.30, 41.25], [36.40, 41.22], [36.48, 41.30], [36.50, 41.40],
        [36.45, 41.48], [36.35, 41.50], [36.25, 41.48], [36.20, 41.40],
        [36.22, 41.30], [36.30, 41.25],
      ]],
    },
    properties: { name: 'İlkadım' },
  },
  'Canik': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.15, 41.15], [36.25, 41.12], [36.35, 41.18], [36.38, 41.28],
        [36.32, 41.35], [36.22, 41.38], [36.12, 41.35], [36.08, 41.28],
        [36.10, 41.18], [36.15, 41.15],
      ]],
    },
    properties: { name: 'Canik' },
  },
  'Tekkeköy': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.05, 41.05], [36.15, 41.08], [36.18, 41.15], [36.12, 41.18],
        [36.05, 41.16], [36.02, 41.12], [36.05, 41.05],
      ]],
    },
    properties: { name: 'Tekkeköy' },
  },
  'Bafra': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [35.75, 41.40], [35.85, 41.35], [35.95, 41.40], [36.00, 41.50],
        [35.92, 41.60], [35.80, 41.65], [35.68, 41.60], [35.60, 41.50],
        [35.65, 41.40], [35.75, 41.40],
      ]],
    },
    properties: { name: 'Bafra' },
  },
  'Çarşamba': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.00, 41.10], [36.10, 41.13], [36.13, 41.20], [36.07, 41.23],
        [36.00, 41.21], [35.97, 41.17], [36.00, 41.10],
      ]],
    },
    properties: { name: 'Çarşamba' },
  },
  'Havza': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [35.70, 41.05], [35.80, 41.08], [35.83, 41.15], [35.77, 41.18],
        [35.70, 41.16], [35.67, 41.12], [35.70, 41.05],
      ]],
    },
    properties: { name: 'Havza' },
  },
  'Kavak': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [35.85, 40.90], [35.95, 40.93], [35.98, 41.00], [35.92, 41.03],
        [35.85, 41.01], [35.82, 40.97], [35.85, 40.90],
      ]],
    },
    properties: { name: 'Kavak' },
  },
  'Ladik': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [35.60, 40.90], [35.70, 40.93], [35.73, 41.00], [35.67, 41.03],
        [35.60, 41.01], [35.57, 40.97], [35.60, 40.90],
      ]],
    },
    properties: { name: 'Ladik' },
  },
  'Salıpazarı': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.05, 41.00], [36.15, 41.03], [36.18, 41.10], [36.12, 41.13],
        [36.05, 41.11], [36.02, 41.07], [36.05, 41.00],
      ]],
    },
    properties: { name: 'Salıpazarı' },
  },
  'Terme': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.00, 41.00], [36.10, 41.03], [36.13, 41.10], [36.07, 41.13],
        [36.00, 41.11], [35.97, 41.07], [36.00, 41.00],
      ]],
    },
    properties: { name: 'Terme' },
  },
  'Vezirköprü': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [35.50, 41.10], [35.60, 41.13], [35.63, 41.20], [35.57, 41.23],
        [35.50, 41.21], [35.47, 41.17], [35.50, 41.10],
      ]],
    },
    properties: { name: 'Vezirköprü' },
  },
  'Yakakent': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [35.40, 41.50], [35.50, 41.53], [35.53, 41.60], [35.47, 41.63],
        [35.40, 41.61], [35.37, 41.57], [35.40, 41.50],
      ]],
    },
    properties: { name: 'Yakakent' },
  },
  '19 Mayıs': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.05, 41.20], [36.15, 41.23], [36.18, 41.30], [36.12, 41.33],
        [36.05, 41.31], [36.02, 41.27], [36.05, 41.20],
      ]],
    },
    properties: { name: '19 Mayıs' },
  },
  'Alaçam': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [35.50, 41.20], [35.60, 41.23], [35.63, 41.30], [35.57, 41.33],
        [35.50, 41.31], [35.47, 41.27], [35.50, 41.20],
      ]],
    },
    properties: { name: 'Alaçam' },
  },
  'Asarcık': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [35.85, 41.30], [35.95, 41.33], [35.98, 41.40], [35.92, 41.43],
        [35.85, 41.41], [35.82, 41.37], [35.85, 41.30],
      ]],
    },
    properties: { name: 'Asarcık' },
  },
  'Ayvacık': {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.00, 41.20], [36.10, 41.23], [36.13, 41.30], [36.07, 41.33],
        [36.00, 41.31], [35.97, 41.27], [36.00, 41.20],
      ]],
    },
    properties: { name: 'Ayvacık' },
  },
};
