/**
 * allNeighborhoods.json dosyasını işler ve ilçe-mahalle formatına çevirir
 * 
 * Input: SQL dump formatı (PHPMyAdmin export)
 * Output: { "İlçe Adı": ["Mahalle1", "Mahalle2", ...] }
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Mahalle Verisi İşleniyor...\n');

// Dosya yolları
const inputPath = path.join(__dirname, '..', 'src', 'data', 'allNeighborhoods.json');
const outputPath = path.join(__dirname, '..', 'src', 'data', 'allNeighborhoods.json');
const backupPath = path.join(__dirname, '..', 'src', 'data', 'allNeighborhoods.backup.json');

try {
  // 1. Dosyayı oku
  console.log('📖 Dosya okunuyor...');
  const rawData = fs.readFileSync(inputPath, 'utf8');
  const jsonData = JSON.parse(rawData);
  
  console.log(`✅ ${jsonData.length} satır okundu`);
  
  // 2. Mahalle verilerini bul
  console.log('\n🔍 Mahalle verileri aranıyor...');
  let mahalleData = null;
  
  for (const item of jsonData) {
    if (item.type === 'table' && item.name === 'mahalle' && item.data) {
      mahalleData = item.data;
      break;
    }
  }
  
  if (!mahalleData) {
    throw new Error('Mahalle verisi bulunamadı!');
  }
  
  console.log(`✅ ${mahalleData.length} mahalle kaydı bulundu`);
  
  // 3. İlçe bilgilerini bul
  console.log('\n🔍 İlçe verileri aranıyor...');
  let ilceData = null;
  
  for (const item of jsonData) {
    if (item.type === 'table' && item.name === 'ilce' && item.data) {
      ilceData = item.data;
      break;
    }
  }
  
  if (!ilceData) {
    console.log('⚠️ İlçe verisi bulunamadı, alternatif yöntem deneniyor...');
    // İlçe verisi yoksa köy verilerinden çıkarmaya çalış
  }
  
  console.log(`✅ ${ilceData ? ilceData.length : 0} ilçe kaydı bulundu`);
  
  // 4. Köy-İlçe eşleşmesi oluştur
  console.log('\n🔗 Köy-İlçe eşleşmesi oluşturuluyor...');
  let koyData = null;
  
  for (const item of jsonData) {
    if (item.type === 'table' && item.name === 'koy' && item.data) {
      koyData = item.data;
      break;
    }
  }
  
  if (!koyData) {
    throw new Error('Köy verisi bulunamadı! İlçe-mahalle eşleşmesi yapılamaz.');
  }
  
  console.log(`✅ ${koyData.length} köy kaydı bulundu`);
  
  // 5. Köy ID → İlçe ID haritası
  const koyToIlce = {};
  koyData.forEach(koy => {
    koyToIlce[koy.id] = koy.ilce_id;
  });
  
  // 6. İlçe ID → İlçe Adı haritası
  const ilceIdToName = {};
  if (ilceData) {
    ilceData.forEach(ilce => {
      ilceIdToName[ilce.id] = ilce.name;
    });
  }
  
  console.log(`✅ ${Object.keys(ilceIdToName).length} ilçe adı eşleştirildi`);
  
  // 7. İlçe → Mahalleler yapısını oluştur
  console.log('\n🏗️ İlçe-Mahalle yapısı oluşturuluyor...');
  const neighborhoods = {};
  let processedCount = 0;
  let skippedCount = 0;
  
  mahalleData.forEach(mahalle => {
    const koyId = mahalle.koy_id;
    const mahalleName = mahalle.name;
    
    // Köy ID'den ilçe ID'yi bul
    const ilceId = koyToIlce[koyId];
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
    
    // "KÖYÜN KENDİSİ" gibi genel isimleri atla
    if (mahalleName === 'KÖYÜN KENDİSİ' || 
        mahalleName === 'MERKEZ' ||
        mahalleName === 'KÖY İÇİ') {
      return;
    }
    
    // İlçe yoksa oluştur
    if (!neighborhoods[ilceName]) {
      neighborhoods[ilceName] = [];
    }
    
    // Mahalle adını düzelt (başharfleri büyük yap)
    const formattedName = mahalleName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    // Duplicate kontrolü
    if (!neighborhoods[ilceName].includes(formattedName)) {
      neighborhoods[ilceName].push(formattedName);
      processedCount++;
    }
  });
  
  // 8. Her ilçenin mahallelerini alfabetik sırala
  Object.keys(neighborhoods).forEach(ilce => {
    neighborhoods[ilce].sort((a, b) => a.localeCompare(b, 'tr'));
  });
  
  console.log(`✅ ${processedCount} mahalle işlendi`);
  console.log(`⚠️ ${skippedCount} kayıt atlandı`);
  console.log(`📊 Toplam ${Object.keys(neighborhoods).length} ilçe`);
  
  // 9. İstatistikler
  const totalNeighborhoods = Object.values(neighborhoods).reduce((sum, arr) => sum + arr.length, 0);
  const avgPerDistrict = (totalNeighborhoods / Object.keys(neighborhoods).length).toFixed(1);
  
  console.log(`\n📈 İstatistikler:`);
  console.log(`   - İlçe sayısı: ${Object.keys(neighborhoods).length}`);
  console.log(`   - Toplam mahalle: ${totalNeighborhoods}`);
  console.log(`   - İlçe başına ortalama: ${avgPerDistrict} mahalle`);
  
  // 10. Backup oluştur
  console.log('\n💾 Backup oluşturuluyor...');
  fs.copyFileSync(inputPath, backupPath);
  console.log(`✅ Backup kaydedildi: ${backupPath}`);
  
  // 11. Yeni veriyi kaydet
  console.log('\n💾 Yeni veri kaydediliyor...');
  fs.writeFileSync(outputPath, JSON.stringify(neighborhoods, null, 2), 'utf8');
  
  const stats = fs.statSync(outputPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`✅ Veri kaydedildi: ${outputPath}`);
  console.log(`   Dosya boyutu: ${fileSizeInMB} MB`);
  
  // 12. Örnek veriler göster
  console.log('\n📋 Örnek Veriler:');
  const sampleDistricts = ['Atakum', 'İlkadım', 'Kadıköy', 'Çankaya', 'Konak'];
  sampleDistricts.forEach(district => {
    if (neighborhoods[district]) {
      console.log(`   - ${district}: ${neighborhoods[district].length} mahalle`);
      console.log(`     İlk 3: ${neighborhoods[district].slice(0, 3).join(', ')}`);
    }
  });
  
  console.log('\n✅ İşlem başarıyla tamamlandı! 🎉');
  console.log('\n📝 Sonraki adım: neighborhoodService.js güncellenecek');
  
} catch (error) {
  console.error('\n❌ Hata:', error.message);
  console.error(error.stack);
  process.exit(1);
}

