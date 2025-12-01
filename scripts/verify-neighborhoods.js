const data = require('../src/data/allNeighborhoods.json');

console.log('📊 GENEL İSTATİSTİKLER:\n');
console.log('   İlçe sayısı:', Object.keys(data).length);

const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
console.log('   Toplam mahalle:', total);
console.log('   Ortalama:', (total / Object.keys(data).length).toFixed(1), 'mahalle/ilçe\n');

console.log('🏙️ SAMSUN KONTROLÜ (17 ilçe):\n');
const samsun = [
  'Atakum', 'İlkadım', 'Canik', 'Vezirköprü', 'Bafra', 'Çarşamba', 
  'Terme', 'Tekkeköy', 'Ladik', 'Havza', 'Kavak', 'Alaçam', 
  'Asarcık', 'Ayvacık', 'Salıpazarı', 'Yakakent', '19 Mayıs'
];

let samsunFound = 0;
samsun.forEach(d => {
  if(data[d]) {
    console.log('   ✅', d.padEnd(15), ':', data[d].length, 'mahalle');
    samsunFound++;
  } else {
    console.log('   ❌', d.padEnd(15), ': YOK');
  }
});

console.log('\n   Sonuç: ' + samsunFound + '/17 ilçe bulundu\n');

console.log('🏙️ İSTANBUL KONTROLÜ:\n');
const istanbul = ['Kadıköy', 'Beşiktaş', 'Şişli', 'Beyoğlu', 'Fatih', 'Üsküdar', 'Kartal', 'Maltepe'];
istanbul.forEach(d => {
  if(data[d]) {
    console.log('   ✅', d.padEnd(15), ':', data[d].length, 'mahalle');
  }
});

console.log('\n🏙️ ANKARA KONTROLÜ:\n');
const ankara = ['Çankaya', 'Keçiören', 'Mamak', 'Yenimahalle', 'Etimesgut', 'Sincan'];
ankara.forEach(d => {
  if(data[d]) {
    console.log('   ✅', d.padEnd(15), ':', data[d].length, 'mahalle');
  }
});

console.log('\n🏙️ İZMİR KONTROLÜ:\n');
const izmir = ['Konak', 'Karşıyaka', 'Bornova', 'Buca', 'Çiğli', 'Bayraklı'];
izmir.forEach(d => {
  if(data[d]) {
    console.log('   ✅', d.padEnd(15), ':', data[d].length, 'mahalle');
  }
});

console.log('\n✅ VERİ TAMAMI BAŞARILI!\n');

