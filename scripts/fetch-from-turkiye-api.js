/**
 * turkiye-api.dev'den TÜM mahalle verilerini çeker
 * Bu RESMİ ve GÜNCEL veridir!
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('🚀 turkiye-api.dev den Tam Veri İndiriliyor...\n');

async function fetchAPI(endpoint) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.turkiyeapi.dev/v1/${endpoint}`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'OK' && json.data) {
            resolve(json.data);
          } else {
            reject(new Error(json.error || 'API hatası'));
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

// Rate limiting için bekle
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    // 1. Tüm illeri çek
    console.log('📍 İller çekiliyor...');
    const provinces = await fetchAPI('provinces');
    console.log(`✅ ${provinces.length} il bulundu\n`);
    
    // 2. Tüm ilçeleri çek
    console.log('📍 İlçeler çekiliyor...');
    const districts = await fetchAPI('districts?limit=1000');
    console.log(`✅ ${districts.length} ilçe bulundu\n`);
    
    // 3. Her ilçe için mahalleleri çek
    console.log('🏘️ Mahalleler çekiliyor...\n');
    
    const neighborhoods = {};
    let totalNeighborhoods = 0;
    let processedDistricts = 0;
    
    for (const district of districts) {
      try {
        // Rate limiting (saniyede 2 istek)
        if (processedDistricts > 0 && processedDistricts % 2 === 0) {
          await sleep(1000);
        }
        
        const districtNeighborhoods = await fetchAPI(
          `neighborhoods?districtId=${district.id}&limit=1000`
        );
        
        if (districtNeighborhoods && districtNeighborhoods.length > 0) {
          neighborhoods[district.name] = districtNeighborhoods.map(n => n.name).sort((a, b) => 
            a.localeCompare(b, 'tr')
          );
          
          totalNeighborhoods += districtNeighborhoods.length;
        }
        
        processedDistricts++;
        
        // İlerleme göster
        const progress = ((processedDistricts / districts.length) * 100).toFixed(1);
        process.stdout.write(`\r📊 İlerleme: ${progress}% (${processedDistricts}/${districts.length} ilçe)`);
        
      } catch (error) {
        console.error(`\n⚠️ Hata (${district.name}):`, error.message);
      }
    }
    
    console.log('\n\n✅ Tüm mahalleler çekildi!\n');
    
    // 4. İstatistikler
    const districtCount = Object.keys(neighborhoods).length;
    const avgPerDistrict = (totalNeighborhoods / districtCount).toFixed(1);
    
    console.log('📈 İstatistikler:');
    console.log(`   - İlçe sayısı: ${districtCount}`);
    console.log(`   - Toplam mahalle: ${totalNeighborhoods}`);
    console.log(`   - Ortalama: ${avgPerDistrict} mahalle/ilçe\n`);
    
    // 5. Örnek veriler
    console.log('📋 Örnek Veriler (Samsun):');
    const samsunDistricts = ['Atakum', 'İlkadım', 'Vezirköprü', 'Canik', 'Çarşamba'];
    samsunDistricts.forEach(district => {
      if (neighborhoods[district]) {
        console.log(`   ✅ ${district}: ${neighborhoods[district].length} mahalle`);
      } else {
        console.log(`   ❌ ${district}: Bulunamadı`);
      }
    });
    
    // 6. Dosyayı kaydet
    console.log('\n💾 Dosya kaydediliyor...');
    
    const dataDir = path.join(__dirname, '..', 'src', 'data');
    const outputPath = path.join(dataDir, 'allNeighborhoods.json');
    const backupPath = path.join(dataDir, 'allNeighborhoods.backup-old.json');
    
    // Mevcut dosyayı yedekle
    if (fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, backupPath);
      console.log('✅ Eski veri yedeklendi');
    }
    
    // Yeni veriyi kaydet
    fs.writeFileSync(outputPath, JSON.stringify(neighborhoods, null, 2), 'utf8');
    
    const stats = fs.statSync(outputPath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`✅ Yeni veri kaydedildi: ${outputPath}`);
    console.log(`   Dosya boyutu: ${fileSizeInMB} MB\n`);
    
    console.log('✅ İşlem başarıyla tamamlandı! 🎉\n');
    console.log('📝 Sonraki adım: Uygulamayı test edin!\n');
    
  } catch (error) {
    console.error('\n❌ Fatal hata:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

