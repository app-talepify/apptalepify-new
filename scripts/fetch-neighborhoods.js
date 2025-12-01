/**
 * Türkiye'nin tüm il, ilçe ve mahalle verilerini çeker
 * 
 * Kullanım:
 * node scripts/fetch-neighborhoods.js
 * 
 * Bu script GitHub'dan güncel mahalle verilerini çeker ve
 * src/data/allNeighborhoods.json dosyasını oluşturur
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Veri kaynağı URL'leri
const DATA_SOURCES = [
  {
    name: 'cosmohacker/turkiye-iller-ve-ilceler-json',
    url: 'https://raw.githubusercontent.com/cosmohacker/turkiye-iller-ve-ilceler-json/master/mahalle.json',
  },
  {
    name: 'ErenKrt Gist',
    url: 'https://gist.githubusercontent.com/ErenKrt/5f40927c4f8cd54cd8493afd58b1809c/raw/',
  },
];

function downloadJSON(url) {
  return new Promise((resolve, reject) => {
    console.log(`📥 İndiriliyor: ${url}`);
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('✅ JSON başarıyla indirildi');
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

function transformData(rawData) {
  console.log('🔄 Veri dönüştürülüyor...');
  
  // Veri formatını kontrol et ve dönüştür
  const neighborhoods = {};
  
  if (Array.isArray(rawData)) {
    // Format 1: Array of cities
    rawData.forEach(city => {
      if (city.ilceleri) {
        city.ilceleri.forEach(district => {
          if (district.mahalleler && Array.isArray(district.mahalleler)) {
            neighborhoods[district.ilce] = district.mahalleler;
          }
        });
      }
    });
  } else if (typeof rawData === 'object') {
    // Format 2: Direct object
    Object.keys(rawData).forEach(key => {
      const value = rawData[key];
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
        neighborhoods[key] = value;
      }
    });
  }
  
  const districtCount = Object.keys(neighborhoods).length;
  const neighborhoodCount = Object.values(neighborhoods).reduce((sum, arr) => sum + arr.length, 0);
  
  console.log(`✅ Dönüştürme tamamlandı:`);
  console.log(`   - ${districtCount} ilçe`);
  console.log(`   - ${neighborhoodCount} mahalle`);
  
  return neighborhoods;
}

function saveData(data, filename) {
  const outputDir = path.join(__dirname, '..', 'src', 'data');
  const outputPath = path.join(outputDir, filename);
  
  // Klasör yoksa oluştur
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // JSON'u dosyaya yaz
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  
  const stats = fs.statSync(outputPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`✅ Veri kaydedildi: ${outputPath}`);
  console.log(`   Dosya boyutu: ${fileSizeInMB} MB`);
  
  return outputPath;
}

async function main() {
  console.log('🚀 Türkiye Mahalle Veritabanı İndiricisi\n');
  
  for (const source of DATA_SOURCES) {
    try {
      console.log(`📍 Kaynak: ${source.name}`);
      
      // Veriyi indir
      const rawData = await downloadJSON(source.url);
      
      // Dönüştür
      const neighborhoods = transformData(rawData);
      
      // Dosyaya kaydet
      const outputPath = saveData(neighborhoods, 'allNeighborhoods.json');
      
      console.log('\n✅ Başarıyla tamamlandı!');
      console.log(`\n📝 Sonraki adımlar:`);
      console.log(`   1. ${outputPath} dosyasını kontrol edin`);
      console.log(`   2. neighborhoodService.js bu dosyayı kullanacak şekilde güncellenecek`);
      
      return; // İlk başarılı kaynaktan sonra dur
      
    } catch (error) {
      console.error(`❌ Hata (${source.name}): ${error.message}`);
      console.log('   Sonraki kaynağı deniyorum...\n');
    }
  }
  
  console.error('\n❌ Tüm kaynaklar başarısız oldu!');
  console.log('\n💡 Manuel Çözüm:');
  console.log('   1. https://github.com/cosmohacker/turkiye-iller-ve-ilceler-json adresine git');
  console.log('   2. mahalle.json dosyasını indir');
  console.log('   3. src/data/allNeighborhoods.json olarak kaydet');
  
  process.exit(1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

