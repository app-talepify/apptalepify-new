// Migration script to update existing portfolios with owner information
import { collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Dev-only log helpers
const devLog = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.log(...args); /* eslint-enable no-console */ } catch {} } };
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

export const migratePortfolioOwners = async () => {
  try {
    devLog('🔄 Portfolio owner migration başlıyor...');

    // Tüm portfolyoları getir
    const portfoliosSnapshot = await getDocs(collection(db, 'portfolios'));
    devLog(`📊 Toplam ${portfoliosSnapshot.docs.length} portfolyo bulundu`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const portfolioDoc of portfoliosSnapshot.docs) {
      try {
        const portfolioData = portfolioDoc.data();
        const portfolioId = portfolioDoc.id;
        const userId = portfolioData.userId;

        // Eğer owner bilgileri zaten varsa skip et
        if (portfolioData.ownerName && String(portfolioData.ownerName).trim() !== '') {
          devLog(`✅ Portfolio ${portfolioId} already has owner data, skipping`);
          continue;
        }

        if (!userId) {
          devWarn(`⚠️ Portfolio ${portfolioId} has no userId, skipping`);
          continue;
        }

        // User bilgilerini getir
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
          devWarn(`⚠️ User ${userId} not found for portfolio ${portfolioId}`);
          continue;
        }

        const userData = userDoc.data();
        const ownerInfo = {
          ownerName: userData.name || userData.displayName || '',
          ownerPhone: userData.phoneNumber || '',
          officeName: userData.officeName || '',
          ownerAvatar: userData.profilePicture || '',
        };

        // Portfolio'yu güncelle
        await updateDoc(doc(db, 'portfolios', portfolioId), ownerInfo);
        devLog(`✅ Portfolio ${portfolioId} updated with owner: ${ownerInfo.ownerName}`);
        updatedCount++;

        // Rate limiting - too many requests hatası almamak için
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`❌ Error updating portfolio ${portfolioDoc.id}:`, error);
        errorCount++;
      }
    }

    devLog(`🎉 Migration tamamlandı! Updated: ${updatedCount}, Errors: ${errorCount}`);
    return { success: true, updated: updatedCount, errors: errorCount };

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Migration failed:', error);
    return { success: false, error: error.message };
  }
};

// Development ortamında çalıştırmak için
export const runMigrationIfDev = async () => {
  if (__DEV__) {
    devLog('🚀 Development mode detected, running migration...');
    return await migratePortfolioOwners();
  } else {
    devLog('⏭️ Production mode, skipping migration');
    return { success: true, skipped: true };
  }
};
