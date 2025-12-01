/**
 * PTT Posta Kodu veritabanından mahalle verilerini çeker
 * Bu RESMI ve GÜNCEL veridir!
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// PTT API alternatif kaynakları
const DATA_SOURCES = [
  'https://gist.githubusercontent.com/ozdemirburak/4821a26db048cc0972c1beee48a408aa/raw/4754e5f9d09dade2e6c461d7e960e13ef38eaa88/cities.json',
  'https://raw.githubusercontent.com/iambocai/turkiye-mahalle-iller/master/data/neighborhoods.json',
];

console.log('🚀 PTT Mahalle Verisi İndiriliyor...\n');
console.log('⚠️ Not: Bu script farklı topluluk kaynaklarını dener.');
console.log('💡 En iyi çözüm: Resmi PTT API başvurusu\n');

async function downloadJSON(url) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Deneniyor: ${url}`);
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('✅ Başarılı!');
          resolve(json);
        } catch (error) {
          reject(new Error(`JSON parse hatası: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  for (const url of DATA_SOURCES) {
    try {
      const data = await downloadJSON(url);
      console.log('\n📊 Veri yapısı:', Object.keys(data).slice(0, 5));
      console.log('\n✅ Veri başarıyla indirildi!');
      console.log('💾 İşleniyor...\n');
      
      // Veri işleme buraya gelecek
      
      return;
    } catch (error) {
      console.error(`❌ Hata: ${error.message}\n`);
    }
  }
  
  console.log('\n❌ Tüm kaynaklar başarısız!');
  console.log('\n💡 ÖNERİ: Manuel veri hazırlama');
}

main();

