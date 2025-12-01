// Firestore kullanıcıları için Firebase Auth users oluşturma script'i
// Kullanım: node scripts/backfillAuthUsers.js [--dry-run] [--force]

const { admin, db, auth } = require('../admin');
const { generateUidFromPhone, ensureFirebaseAuthUser } = require('../authRoutes');

// Command line arguments
const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

console.log(`
🚀 Firebase Auth Users Backfill Script
=======================================
Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'REAL RUN (will make changes)'}
Force: ${isForce ? 'Enabled (overwrite existing)' : 'Disabled (skip existing)'}
`);

/**
 * Ana backfill fonksiyonu
 */
async function backfillAuthUsers() {
  try {
    console.log('📚 Firestore users collection okunuyor...');
    
    // Firestore'dan tüm kullanıcıları al
    const usersSnapshot = await db.collection('users').get();
    const totalUsers = usersSnapshot.size;
    
    console.log(`📊 Toplam Firestore kullanıcısı: ${totalUsers}`);
    
    if (totalUsers === 0) {
      console.log('ℹ️  Hiç kullanıcı bulunamadı. Script sonlandırılıyor.');
      return;
    }
    
    let processed = 0;
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    console.log('\n🔄 İşlem başlatılıyor...\n');
    
    // Her kullanıcı için işlem yap
    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const firestoreUid = userDoc.id;
        const phoneNumber = userData.phoneNumber;
        
        processed++;
        
        console.log(`[${processed}/${totalUsers}] İşleniyor: ${firestoreUid}`);
        console.log(`  📱 Telefon: ${phoneNumber || 'Belirtilmemiş'}`);
        
        // Telefon numarası kontrolü
        if (!phoneNumber) {
          console.log(`  ⚠️  Telefon numarası eksik, atlanıyor`);
          skipped++;
          continue;
        }
        
        // UID'den telefon tutarlılığı kontrolü
        const expectedUid = generateUidFromPhone(phoneNumber);
        if (firestoreUid !== expectedUid) {
          console.log(`  ⚠️  UID mismatch! Firestore: ${firestoreUid}, Expected: ${expectedUid}`);
          if (!isForce) {
            console.log(`  ⚠️  Force mode değil, atlanıyor`);
            skipped++;
            continue;
          }
        }
        
        // Firebase Auth'da kullanıcı var mı kontrol et
        let authUserExists = false;
        try {
          await auth.getUser(firestoreUid);
          authUserExists = true;
          console.log(`  ✅ Firebase Auth kullanıcısı zaten mevcut`);
        } catch (error) {
          if (error.code !== 'auth/user-not-found') {
            throw error; // Başka bir hata
          }
          console.log(`  📝 Firebase Auth kullanıcısı bulunamadı, oluşturulacak`);
        }
        
        // Mevcut kullanıcıyı atla (force mode değilse)
        if (authUserExists && !isForce) {
          skipped++;
          continue;
        }
        
        // DRY RUN modunda sadece log
        if (isDryRun) {
          console.log(`  🔍 DRY RUN: Firebase Auth kullanıcısı oluşturulacak`);
          created++;
          continue;
        }
        
        // Firebase Auth kullanıcısını oluştur/güncelle
        if (authUserExists && isForce) {
          console.log(`  🔄 Mevcut kullanıcı güncelleniyor (force mode)`);
          await auth.updateUser(firestoreUid, {
            phoneNumber: phoneNumber,
            disabled: false,
          });
        } else {
          console.log(`  ➕ Yeni Firebase Auth kullanıcısı oluşturuluyor`);
          await ensureFirebaseAuthUser(firestoreUid, phoneNumber);
        }
        
        created++;
        console.log(`  ✅ Başarılı!`);
        
        // Rate limiting - her 10 kullanıcıda bir bekle
        if (processed % 10 === 0) {
          console.log(`  ⏳ Rate limiting: 1 saniye bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        errors++;
        console.error(`  ❌ Hata:`, error.message);
        
        // Kritik hata - devam et ama log
        if (error.code === 'auth/quota-exceeded') {
          console.error(`  🚨 Firebase Auth quota aşıldı! 5 saniye bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      console.log(''); // Boş satır
    }
    
    // Özet
    console.log(`
🎯 İşlem Tamamlandı!
===================
👥 Toplam kullanıcı: ${totalUsers}
✅ İşlenen: ${processed}
➕ Oluşturulan: ${created}
⏭️  Atlanan: ${skipped}
❌ Hatalı: ${errors}

${isDryRun ? '🔍 Bu bir DRY RUN idi - hiçbir değişiklik yapılmadı!' : '💾 Değişiklikler uygulandı!'}
`);
    
    if (errors > 0) {
      console.log(`⚠️  ${errors} hata oluştu. Loglarda detayları kontrol edin.`);
    }
    
  } catch (error) {
    console.error('🚨 Kritik hata:', error);
    process.exit(1);
  }
}

/**
 * İstatistik fonksiyonu
 */
async function showStats() {
  try {
    console.log('📊 Mevcut durum analizi...\n');
    
    // Firestore stats
    const usersSnapshot = await db.collection('users').get();
    const firestoreCount = usersSnapshot.size;
    console.log(`📚 Firestore users: ${firestoreCount}`);
    
    // Firebase Auth stats
    let authCount = 0;
    let authUsers = [];
    let nextPageToken;
    
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      authUsers = authUsers.concat(listUsersResult.users);
      authCount += listUsersResult.users.length;
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);
    
    console.log(`🔐 Firebase Auth users: ${authCount}`);
    
    // Missing analysis
    const firestoreUids = new Set(usersSnapshot.docs.map(doc => doc.id));
    const authUids = new Set(authUsers.map(user => user.uid));
    
    const missingInAuth = [...firestoreUids].filter(uid => !authUids.has(uid));
    const missingInFirestore = [...authUids].filter(uid => !firestoreUids.has(uid));
    
    console.log(`\n📈 Analiz:`);
    console.log(`  Firebase Auth'da eksik: ${missingInAuth.length}`);
    console.log(`  Firestore'da eksik: ${missingInFirestore.length}`);
    
    if (missingInAuth.length > 0) {
      console.log(`\n🔍 Firebase Auth'da eksik olan ilk 5 UID:`);
      missingInAuth.slice(0, 5).forEach(uid => console.log(`  - ${uid}`));
    }
    
    return {
      firestoreCount,
      authCount,
      missingInAuth: missingInAuth.length,
      missingInFirestore: missingInFirestore.length,
    };
    
  } catch (error) {
    console.error('📊 İstatistik hatası:', error);
    return null;
  }
}

/**
 * Ana fonksiyon
 */
async function main() {
  try {
    // Help
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      console.log(`
Kullanım: node scripts/backfillAuthUsers.js [options]

Options:
  --dry-run        Hiçbir değişiklik yapmadan simülasyon çalıştır
  --force          Mevcut Firebase Auth kullanıcılarını güncelle
  --stats          Sadece istatistikleri göster
  --help, -h       Bu yardım mesajını göster

Örnekler:
  node scripts/backfillAuthUsers.js --dry-run
  node scripts/backfillAuthUsers.js --stats
  node scripts/backfillAuthUsers.js --force
`);
      return;
    }
    
    // Sadece stats
    if (process.argv.includes('--stats')) {
      await showStats();
      return;
    }
    
    // Ana işlem
    await showStats();
    console.log('\n' + '='.repeat(50) + '\n');
    await backfillAuthUsers();
    
  } catch (error) {
    console.error('🚨 Script hatası:', error);
    process.exit(1);
  } finally {
    console.log('\n👋 Script tamamlandı.');
    process.exit(0);
  }
}

// Script'i çalıştır
if (require.main === module) {
  main();
}

module.exports = {
  backfillAuthUsers,
  showStats,
};
