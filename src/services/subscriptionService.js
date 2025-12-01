import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export const getSubscriptionHistory = async (userId) => {
  if (!userId) {
    return { success: false, error: 'Kullanıcı IDsi gerekli' };
  }

  try {
    const historyRef = collection(db, 'users', userId, 'subscriptionHistory');
    const q = query(historyRef, orderBy('purchaseDate', 'desc'));
    const querySnapshot = await getDocs(q);

    const history = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        purchaseDate: data.purchaseDate?.toDate()?.toISOString(),
      };
    });

    return { success: true, history };
  } catch (error) {
    console.error('Abonelik geçmişi alınırken hata:', error);
    return { success: false, error: error.message };
  }
};
