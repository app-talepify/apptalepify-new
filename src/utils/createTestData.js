import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

// Test verileri oluşturma fonksiyonu
export const createTestData = async () => {
  try {
    // Prod güvenliği: yalnızca geliştirme modunda çalıştır
    if (!(typeof __DEV__ !== 'undefined' && __DEV__)) {
      return { success: false, error: 'createTestData üretimde devre dışı' };
    }
    // Test portfolyo verisi
    const testPortfolio = {
      title: 'Test Emlak Portföyü',
      description: 'Bu bir test emlak portföyüdür.',
      city: 'İstanbul',
      district: 'Kadıköy',
      propertyType: 'Daire',
      price: 1500000,
      area: 120,
      rooms: '3+1',
      floor: 5,
      totalFloors: 8,
      buildingAge: 10,
      isPublished: true,
      listingStatus: 'Satılık',
      images: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa',
      imagesMeta: [{
        url: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa',
        width: 800,
        height: 600
      }],
      userId: 'test-user-id',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Test talep verisi
    const testRequest = {
      title: 'Kadıköy\'de Daire Aranıyor',
      description: 'Kadıköy bölgesinde 2+1 daire aranmaktadır.',
      city: 'İstanbul',
      district: 'Kadıköy',
      propertyType: 'Daire',
      minPrice: 800000,
      maxPrice: 1200000,
      minArea: 80,
      maxArea: 120,
      rooms: '2+1',
      isPublished: true,
      publishToPool: true,
      userId: 'test-user-id',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Verileri Firestore'a ekle
    await addDoc(collection(db, 'portfolios'), testPortfolio);
    await addDoc(collection(db, 'requests'), testRequest);

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('✅ Test verileri başarıyla oluşturuldu!');
    }
    return { success: true };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Test verileri oluşturulurken hata:', error);
    return { success: false, error: error.message };
  }
};

// Kullanım: createTestData();
