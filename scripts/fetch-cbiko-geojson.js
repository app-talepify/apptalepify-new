/**
 * cbiko/turkey-geojson'dan mahalle verilerini çeker
 * Bu kaynak TÜİK resmi verisinden türetilmiştir
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('🚀 cbiko/turkey-geojson Mahalle Verisi İndiriliyor...\n');

// cbiko repository'deki mahalle dosyası
const NEIGHBORHOODS_URL = 'https://raw.githubusercontent.com/cbiko/turkey-geojson/master/json/neighborhoods.json';

async function downloadJSON(url) {
  return new Promise((resolve, reject) => {
    console.log(`📥 İndiriliyor: ${url}\n`);
    
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Redirect varsa takip et
        return https.get(res.headers.location, (res2) => {
          processResponse(res2, resolve, reject);
        }).on('error', reject);
      }
      
      processResponse(res, resolve, reject);
    }).on('error', reject);
  });
}

function processResponse(res, resolve, reject) {
  let data = '';
  let totalSize = parseInt(res.headers['content-length'] || '0');
  let downloaded = 0;
  
  res.on('data', (chunk) => {
    data += chunk;
    downloaded += chunk.length;
    
    if (totalSize > 0) {
      const percent = ((downloaded / totalSize) * 100).toFixed(1);
      process.stdout.write(`\r📊 İndiriliyor: ${percent}% (${(downloaded / 1024 / 1024).toFixed(2)} MB)`);
    }
  });
  
  res.on('end', () => {
    console.log('\n\n✅ İndirme tamamlandı!\n');
    try {
      const json = JSON.parse(data);
      resolve(json);
    } catch (error) {
      reject(new Error(`JSON parse hatası: ${error.message}`));
    }
  });
}

function transformGeoJSONToNeighborhoods(geojson) {
  console.log('🔄 GeoJSON dönüştürülüyor...\n');
  
  const neighborhoods = {};
  let processedCount = 0;
  
  if (geojson.type === 'FeatureCollection' && geojson.features) {
    geojson.features.forEach(feature => {
      const props = feature.properties;
      
      // İlçe ve mahalle bilgilerini al
      const district = props.district || props.ilce || props.ILCE_ADI;
      const neighborhood = props.name || props.mahalle || props.MAHALLE_ADI;
      
      if (district && neighborhood) {
        // İlçe adını temizle ve formatla
        const districtName = district
          .trim()
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        
        // Mahalle adını temizle ve formatla  
        const neighborhoodName = neighborhood
          .trim()
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        
        if (!neighborhoods[districtName]) {
          neighborhoods[districtName] = new Set();
        }
        
        neighborhoods[districtName].add(neighborhoodName);
        processedCount++;
      }
    });
  }
  
  // Set'leri array'e çevir ve sırala
  const finalNeighborhoods = {};
  Object.keys(neighborhoods).forEach(district => {
    finalNeighborhoods[district] = Array.from(neighborhoods[district]).sort((a, b) => 
      a.localeCompare(b, 'tr')
    );
  });
  
  console.log(`✅ ${processedCount} kayıt işlendi`);
  console.log(`📊 ${Object.keys(finalNeighborhoods).length} ilçe bulundu\n`);
  
  return finalNeighborhoods;
}

async function main() {
  try {
    // 1. Veriyi indir
    const geojson = await downloadJSON(NEIGHBORHOODS_URL);
    
    console.log('📋 GeoJSON Bilgileri:');
    console.log(`   Tip: ${geojson.type}`);
    console.log(`   Feature sayısı: ${geojson.features ? geojson.features.length : 0}\n`);
    
    if (!geojson.features || geojson.features.length === 0) {
      throw new Error('GeoJSON features bulunamadı!');
    }
    
    // 2. Dönüştür
    const neighborhoods = transformGeoJSONToNeighborhoods(geojson);
    
    // 3. İstatistikler
    const districtCount = Object.keys(neighborhoods).length;
    const totalNeighborhoods = Object.values(neighborhoods).reduce((sum, arr) => sum + arr.length, 0);
    const avgPerDistrict = (totalNeighborhoods / districtCount).toFixed(1);
    
    console.log('📈 Sonuç İstatistikleri:');
    console.log(`   - İlçe sayısı: ${districtCount}`);
    console.log(`   - Toplam mahalle: ${totalNeighborhoods}`);
    console.log(`   - Ortalama: ${avgPerDistrict} mahalle/ilçe\n`);
    
    // 4. Örnek veriler
    console.log('📋 Örnek Veriler:');
    const sampleDistricts = ['Atakum', 'İlkadım', 'Vezirköprü', 'Kadıköy', 'Çankaya'];
    sampleDistricts.forEach(district => {
      if (neighborhoods[district]) {
        console.log(`\n   ✅ ${district}: ${neighborhoods[district].length} mahalle`);
        console.log(`      İlk 5: ${neighborhoods[district].slice(0, 5).join(', ')}`);
      } else {
        console.log(`\n   ❌ ${district}: Bulunamadı`);
      }
    });
    
    // 5. Dosyayı kaydet
    console.log('\n\n💾 Dosya kaydediliyor...');
    
    const dataDir = path.join(__dirname, '..', 'src', 'data');
    const outputPath = path.join(dataDir, 'allNeighborhoods.json');
    const backupPath = path.join(dataDir, 'allNeighborhoods.backup.json');
    
    // Backup oluştur
    if (fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, backupPath);
      console.log('✅ Backup oluşturuldu');
    }
    
    // Yeni veriyi kaydet
    fs.writeFileSync(outputPath, JSON.stringify(neighborhoods, null, 2), 'utf8');
    
    const stats = fs.statSync(outputPath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`✅ Veri kaydedildi: ${outputPath}`);
    console.log(`   Dosya boyutu: ${fileSizeInMB} MB\n`);
    
    console.log('✅ İşlem başarıyla tamamlandı! 🎉\n');
    
  } catch (error) {
    console.error('\n❌ Hata:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

