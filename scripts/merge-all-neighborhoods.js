/**
 * il.json, ilce.json, koy.json ve mahalle.json dosyalarını birleştirip
 * İlçe → Mahalleler formatında tek dosya oluşturur
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Tüm Mahalle Verileri Birleştiriliyor...\n');

const dataDir = path.join(__dirname, '..', 'src', 'data');

try {
  // 1. Tüm dosyaları oku
  console.log('📖 Dosyalar okunuyor...');
  
  const ilRaw = fs.readFileSync(path.join(dataDir, 'il.json'), 'utf8');
  const ilceRaw = fs.readFileSync(path.join(dataDir, 'ilce.json'), 'utf8');
  const koyRaw = fs.readFileSync(path.join(dataDir, 'koy.json'), 'utf8');
  const mahalleRaw = fs.readFileSync(path.join(dataDir, 'mahalle.json'), 'utf8');
  
  console.log('✅ Tüm dosyalar okundu');
  
  // 2. JSON'a çevir
  console.log('\n🔄 JSON parse ediliyor...');
  
  const ilData = JSON.parse(ilRaw);
  const ilceData = JSON.parse(ilceRaw);
  const koyData = JSON.parse(koyRaw);
  const mahalleData = JSON.parse(mahalleRaw);
  
  // Veri tablosunu bul
  const ilTable = ilData.find(item => item.type === 'table' && item.name === 'il');
  const ilceTable = ilceData.find(item => item.type === 'table' && item.name === 'ilce');
  const koyTable = koyData.find(item => item.type === 'table' && item.name === 'koy');
  const mahalleTable = mahalleData.find(item => item.type === 'table' && item.name === 'mahalle');
  
  if (!ilTable || !ilceTable || !koyTable || !mahalleTable) {
    throw new Error('Veri tabloları bulunamadı!');
  }
  
  const iller = ilTable.data;
  const ilceler = ilceTable.data;
  const koyler = koyTable.data;
  const mahalleler = mahalleTable.data;
  
  console.log(`✅ ${iller.length} il`);
  console.log(`✅ ${ilceler.length} ilçe`);
  console.log(`✅ ${koyler.length} köy`);
  console.log(`✅ ${mahalleler.length} mahalle`);
  
  // 3. Haritalar oluştur
  console.log('\n🗺️ Eşleştirme haritaları oluşturuluyor...');
  
  // İl ID → İl Adı
  const ilIdToName = {};
  iller.forEach(il => {
    ilIdToName[il.id] = il.name;
  });
  
  // İlçe ID → İlçe Adı
  const ilceIdToName = {};
  ilceler.forEach(ilce => {
    ilceIdToName[ilce.id] = ilce.name;
  });
  
  // Köy ID → İlçe ID
  const koyIdToIlceId = {};
  koyler.forEach(koy => {
    koyIdToIlceId[koy.id] = koy.ilce_id;
  });
  
  console.log('✅ Haritalar oluşturuldu');
  
  // 4. İlçe → Mahalleler yapısını oluştur
  console.log('\n🏗️ İlçe-Mahalle yapısı oluşturuluyor...');
  
  const neighborhoods = {};
  let processedCount = 0;
  let skippedCount = 0;
  
  mahalleler.forEach(mahalle => {
    const koyId = mahalle.koy_id;
    const mahalleName = mahalle.name;
    
    // Köy ID'den ilçe ID'yi bul
    const ilceId = koyIdToIlceId[koyId];
    if (!ilceId) {
      skippedCount++;
      return;
    }
    
    // İlçe ID'den ilçe adını bul
    const ilceName = ilceIdToName[ilceId];
    if (!ilceName) {
      skippedCount++;
      return;
    }
    
    // Genel isimleri atla
    const skipNames = [
      'KÖYÜN KENDİSİ', 
      'KÖY İÇİ',
      'KÖYÜN KEND.',
      'KÖY MERKEZ',
      'MERKEZ OKUL'
    ];
    
    if (skipNames.some(skip => mahalleName.includes(skip))) {
      return;
    }
    
    // İlçe yoksa oluştur
    if (!neighborhoods[ilceName]) {
      neighborhoods[ilceName] = new Set();
    }
    
    // Mahalle adını düzelt (title case)
    const formattedName = mahalleName
      .split(' ')
      .map(word => {
        // Kısaltmalar için özel durum
        if (['OSB', 'ORGANİZE', 'MÜCAVİR'].some(abbr => word.includes(abbr))) {
          return word;
        }
        // Türkçe karakter desteği
        const lower = word.toLowerCase()
          .replace('i̇', 'i')
          .replace('ı', 'ı');
        
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ')
      .replace('İ', 'İ') // Türkçe İ'yi koru
      .trim();
    
    // Set kullanarak otomatik duplicate kontrolü
    neighborhoods[ilceName].add(formattedName);
    processedCount++;
  });
  
  // Set'leri array'e çevir ve sırala
  const finalNeighborhoods = {};
  Object.keys(neighborhoods).forEach(ilce => {
    finalNeighborhoods[ilce] = Array.from(neighborhoods[ilce]).sort((a, b) => 
      a.localeCompare(b, 'tr')
    );
  });
  
  console.log(`✅ ${processedCount} mahalle işlendi`);
  console.log(`⚠️ ${skippedCount} kayıt atlandı`);
  
  // 5. İstatistikler
  const districtCount = Object.keys(finalNeighborhoods).length;
  const totalNeighborhoods = Object.values(finalNeighborhoods).reduce((sum, arr) => sum + arr.length, 0);
  const avgPerDistrict = (totalNeighborhoods / districtCount).toFixed(1);
  
  console.log(`\n📈 İstatistikler:`);
  console.log(`   - İlçe sayısı: ${districtCount}`);
  console.log(`   - Toplam mahalle: ${totalNeighborhoods}`);
  console.log(`   - İlçe başına ortalama: ${avgPerDistrict} mahalle`);
  
  // 6. Örnek veriler göster
  console.log('\n📋 Örnek Veriler:');
  const sampleDistricts = ['Atakum', 'İlkadım', 'Vezirköprü', 'Kadıköy', 'Çankaya'];
  sampleDistricts.forEach(district => {
    if (finalNeighborhoods[district]) {
      console.log(`\n   ✅ ${district}: ${finalNeighborhoods[district].length} mahalle`);
      console.log(`      İlk 5: ${finalNeighborhoods[district].slice(0, 5).join(', ')}`);
    } else {
      console.log(`\n   ❌ ${district}: Bulunamadı`);
    }
  });
  
  // 7. Dosyayı kaydet
  console.log('\n💾 Dosya kaydediliyor...');
  
  const outputPath = path.join(dataDir, 'allNeighborhoods.json');
  const backupPath = path.join(dataDir, 'allNeighborhoods.backup.json');
  
  // Mevcut dosyayı yedekle
  if (fs.existsSync(outputPath)) {
    fs.copyFileSync(outputPath, backupPath);
    console.log('✅ Backup oluşturuldu');
  }
  
  // Yeni veriyi kaydet
  fs.writeFileSync(outputPath, JSON.stringify(finalNeighborhoods, null, 2), 'utf8');
  
  const stats = fs.statSync(outputPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`✅ Veri kaydedildi: ${outputPath}`);
  console.log(`   Dosya boyutu: ${fileSizeInMB} MB`);
  
  // 8. Eski dosyaları temizle (opsiyonel)
  console.log('\n🧹 Ham veri dosyaları saklanıyor (gerekirse silebilirsiniz):');
  console.log('   - il.json');
  console.log('   - ilce.json');
  console.log('   - koy.json');
  console.log('   - mahalle.json');
  
  console.log('\n✅ İşlem başarıyla tamamlandı! 🎉');
  console.log('\n📝 Sonraki adım: neighborhoodService.js güncellenecek');
  
} catch (error) {
  console.error('\n❌ Hata:', error.message);
  console.error(error.stack);
  process.exit(1);
}

