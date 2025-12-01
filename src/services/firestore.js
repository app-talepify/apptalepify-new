import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

// Dev log helpers
const devLog = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.log(...args); /* eslint-enable no-console */ } catch {} } };
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

// Utility function to convert Firestore timestamps to ISO strings
const convertTimestamps = (data) => {
  return {
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
  };
};

// Türkçe: Görsel alanlarında geriye dönük uyumluluk (Cloudinary URL dizeleri)
function normalizeImagesForWrite(data) {
  const out = { ...data };
  // Yeni şema önerisi: images (string URL), imagesMeta (meta dizi)
  if (Array.isArray(out.imagesMeta)) {
    // Zaten yeni şema kullanılıyor
    return out;
  }
  // Eski veriyi koru; yeni alanlar yoksa ekleme
  // Burada veri yazımını zorlamıyoruz; yalnızca mevcut alanları geçiyoruz
  return out;
}

// Utility function for client-side filtering
const applyFilters = (item, filters) => {
  if (filters.city && item.city !== filters.city) {return false;}
  if (filters.district && item.district !== filters.district) {return false;}
  if (filters.propertyType && item.propertyType !== filters.propertyType) {return false;}
  if (filters.listingStatus && item.listingStatus !== filters.listingStatus) {return false;}
  if (filters.minPrice && item.price < filters.minPrice) {return false;}
  if (filters.maxPrice && item.price > filters.maxPrice) {return false;}
  return true;
};

// Utility function for request filtering
const applyRequestFilters = (item, filters) => {
  if (filters.city && item.city !== filters.city) {return false;}
  if (filters.district && item.district !== filters.district) {return false;}
  if (filters.propertyType && item.propertyType !== filters.propertyType) {return false;}
  if (filters.minPrice && item.maxPrice < filters.minPrice) {return false;}
  if (filters.maxPrice && item.minPrice > filters.maxPrice) {return false;}
  return true;
};

// Real Firestore service - Portfolios
export const fetchPortfolios = async (filters = {}, showOnlyPublished = true) => {
  try {
    // Simplified query to avoid index requirements
    let q = query(collection(db, 'portfolios'));

    // Only apply isPublished filter for now (no complex queries)
    if (showOnlyPublished) {
      q = query(q, where('isPublished', '==', true));
    }

    const querySnapshot = await getDocs(q);
    const portfolios = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();

      // Apply client-side filtering using utility function
      if (applyFilters(data, filters)) {
        portfolios.push({
          id: doc.id,
          ...convertTimestamps(data),
        });
      }
    });

    // Sort by creation date on client side
    portfolios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return portfolios;
  } catch (error) {
    devWarn('Firestore fetchPortfolios Error:', error?.message || error);
    // Error fetching portfolios - return empty array
    return [];
  }
};

// Fetch user's own portfolios
export const fetchUserPortfolios = async (userId) => {
  try {
    const q = query(
      collection(db, 'portfolios'),
      where('userId', '==', userId),
    );

    const querySnapshot = await getDocs(q);
    const portfolios = [];

    querySnapshot.forEach((doc) => {
      portfolios.push({
        id: doc.id,
        ...convertTimestamps(doc.data()),
      });
    });

    // Sort by creation date on client side
    portfolios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return portfolios;
  } catch (error) {
    // Error fetching user portfolios - return empty array
    return [];
  }
};

// Fetch all requests (published ones for public view)
export const fetchRequests = async (filters = {}, showOnlyPublished = true) => {
  try {
    // Query: sadece yayınlanmış ve havuza açık talepler
    let q = query(collection(db, 'requests'));

    if (showOnlyPublished) {
      q = query(q, where('isPublished', '==', true), where('publishToPool', '==', true));
    }

    const querySnapshot = await getDocs(q);
    const requests = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();

      // Apply client-side filtering using utility function
      if (applyRequestFilters(data, filters)) {
        requests.push({
          id: doc.id,
          ...convertTimestamps(data),
        });
      }
    });

    // Sort by creation date on client side
    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return requests;
  } catch (error) {
    // Error fetching requests - return empty array
    return [];
  }
};

// Paginated fetch for requests (for very large datasets like 60k+)
// Usage:
//   const { items, nextCursor } = await fetchRequestsPaginated({ pageSize: 30, cursor, city: 'İstanbul' }, true)
// - cursor: pass the last document snapshot object you received from previous call (opaque to the caller)
// - filters: supports same client-side filters; server query is minimal to avoid index issues
export const fetchRequestsPaginated = async (params = {}, showOnlyPublished = true) => {
  const {
    pageSize = 30,
    cursor = null,
    filters = {},
  } = params || {};

  try {
    // Build minimal indexed query; sorting by createdAt desc for stable paging
    let q = query(
      collection(db, 'requests'),
      orderBy('createdAt', 'desc'),
      limit(Math.max(1, Math.min(pageSize, 100)))
    );

    if (showOnlyPublished) {
      // Keep query simple to avoid composite index needs; use two where filters that are usually indexed
      q = query(q, where('isPublished', '==', true), where('publishToPool', '==', true));
    }

    if (cursor) {
      q = query(q, startAfter(cursor));
    }

    const snap = await getDocs(q);
    const items = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (applyRequestFilters(data, filters)) {
        items.push({
          id: docSnap.id,
          ...convertTimestamps(data),
          __cursor: docSnap, // preserve for external paging
        });
      }
    });

    // next cursor is last visible doc snapshot; the caller should pass it back
    const lastDoc = snap.docs[snap.docs.length - 1] || null;

    return {
      items,
      nextCursor: lastDoc || null,
      hasMore: !!lastDoc,
    };
  } catch (error) {
    return { items: [], nextCursor: null, hasMore: false };
  }
};

// Fetch user's own requests
export const fetchUserRequests = async (userId) => {
  try {
    const q = query(
      collection(db, 'requests'),
      where('userId', '==', userId),
    );

    const querySnapshot = await getDocs(q);
    const requests = [];

    querySnapshot.forEach((doc) => {
      requests.push({
        id: doc.id,
        ...convertTimestamps(doc.data()),
      });
    });

    // Sort by creation date on client side
    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return requests;
  } catch (error) {
    // Error fetching user requests - return empty array
    return [];
  }
};

// Toggle portfolio publish status
export const togglePortfolioPublishStatus = async (portfolioId, isPublished) => {
  try {
    devLog('🔥 [FIRESTORE] togglePortfolioPublishStatus başlatıldı:', portfolioId, isPublished);
    const portfolioRef = doc(db, 'portfolios', portfolioId);

    // Önce document'in var olup olmadığını kontrol et
    devLog('🔥 [FIRESTORE] Document alınıyor...');
    const portfolioDoc = await getDoc(portfolioRef);
    devLog('🔥 [FIRESTORE] Document exists:', portfolioDoc.exists());

    if (!portfolioDoc.exists()) {
      return { success: false, error: 'Portfolio not found' };
    }

    devLog('🔥 [FIRESTORE] updateDoc başlatılıyor...');
    await updateDoc(portfolioRef, {
      isPublished: isPublished,
      updatedAt: serverTimestamp(),
    });

    devLog('🔥 [FIRESTORE] ✅ updateDoc başarılı!');
    return { success: true, isPublished };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Toggle request publish status
export const toggleRequestPublishStatus = async (requestId, isPublished) => {
  try {
    const requestRef = doc(db, 'requests', requestId);
    await updateDoc(requestRef, {
      isPublished: isPublished,
      updatedAt: serverTimestamp(),
    });

    return { success: true, isPublished };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Add new portfolio
export const addPortfolio = async (portfolioData, userId) => {
  try {
    devLog('🏠 addPortfolio başladı, userId:', userId);
    if (__DEV__) { try { /* eslint-disable no-console */ console.log('🏠 portfolioData keys:', Object.keys(portfolioData || {})); /* eslint-enable no-console */ } catch {} }
    
    // User bilgilerini Firestore'dan çek
    let ownerInfo = {};
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        ownerInfo = {
          ownerName: userData.name || userData.displayName || 'Portfolio Sahibi',
          ownerPhone: userData.phoneNumber || '',
          officeName: userData.officeName || '',
          ownerAvatar: userData.profilePicture || '',
        };
        devLog('🏠 User bilgileri alındı');
      } else {
        devLog('🏠 User bulunamadı');
        ownerInfo = {
          ownerName: 'Portfolio Sahibi',
          ownerPhone: '',
          officeName: '',
          ownerAvatar: '',
        };
      }
    } catch (userError) {
      devWarn('🏠 User bilgileri alınamadı:', userError?.message || userError);
      ownerInfo = {
        ownerName: 'Portfolio Sahibi',
        ownerPhone: '',
        officeName: '',
        ownerAvatar: '',
      };
    }
    
    const data = normalizeImagesForWrite(portfolioData);
    devLog('🏠 normalizeImagesForWrite tamamlandı');
    
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    const nextAt = new Date(Date.now() + tenDaysMs);
    const portfolioRef = await addDoc(collection(db, 'portfolios'), {
      ...data,
      ...ownerInfo, // User bilgilerini portfolio'ya ekle
      userId,
      isPublished: data.isPublished || false, // FormData'dan gelen değeri kullan
      phase: null,
      nextActionAt: nextAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    devLog('🏠 Firestore\'a eklendi, ID:', portfolioRef.id);

    return {
      success: true,
      portfolio: {
        id: portfolioRef.id,
        ...data,
        userId,
        isPublished: data.isPublished || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    devWarn('🏠 addPortfolio hatası:', error?.message || error);
    return { success: false, error: error.message };
  }
};

// Add new request
export const addRequest = async (requestData, userId) => {
  try {
    const data = normalizeImagesForWrite(requestData);
    const tenDaysMs2 = 10 * 24 * 60 * 60 * 1000;
    const nextAt2 = new Date(Date.now() + tenDaysMs2);
    const requestRef = await addDoc(collection(db, 'requests'), {
      ...data,
      userId,
      isPublished: data.isPublished || false,
      publishToPool: data.publishToPool || false,
      phase: null,
      nextActionAt: nextAt2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      success: true,
      request: {
        id: requestRef.id,
        ...data,
        userId,
        isPublished: data.isPublished || false,
        publishToPool: data.publishToPool || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      requestId: requestRef.id,
    };
  } catch (error) {
    devWarn('addRequest error:', error?.message || error);
    return { success: false, error: error.message };
  }
};

// Update portfolio
export const updatePortfolio = async (portfolioId, updateData) => {
  try {
    const data = normalizeImagesForWrite(updateData);
    const portfolioRef = doc(db, 'portfolios', portfolioId);
    const tenDaysMs3 = 10 * 24 * 60 * 60 * 1000;
    const nextAt3 = new Date(Date.now() + tenDaysMs3);
    await updateDoc(portfolioRef, {
      ...data,
      phase: null,
      nextActionAt: nextAt3,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    devWarn('updatePortfolio error:', error?.message || error);
    return { success: false, error: error.message };
  }
};

// Update request
export const updateRequest = async (requestId, updateData) => {
  try {
    const data = normalizeImagesForWrite(updateData);
    const requestRef = doc(db, 'requests', requestId);
    const tenDaysMs4 = 10 * 24 * 60 * 60 * 1000;
    const nextAt4 = new Date(Date.now() + tenDaysMs4);
    await updateDoc(requestRef, {
      ...data,
      phase: null,
      nextActionAt: nextAt4,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    devWarn('updateRequest error:', error?.message || error);
    return { success: false, error: error.message };
  }
};

// Delete portfolio
export const deletePortfolio = async (portfolioId) => {
  try {
    await deleteDoc(doc(db, 'portfolios', portfolioId));
  } catch (error) {
    devWarn('deletePortfolio error:', error?.message || error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

// Delete request
export const deleteRequest = async (requestId) => {
  try {
    await deleteDoc(doc(db, 'requests', requestId));
  } catch (error) {
    devWarn('deleteRequest error:', error?.message || error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

// Get single portfolio
export const getPortfolio = async (portfolioId) => {
  try {
    const portfolioRef = doc(db, 'portfolios', portfolioId);
    const portfolioSnap = await getDoc(portfolioRef);

    if (portfolioSnap.exists()) {
      return {
        id: portfolioSnap.id,
        ...convertTimestamps(portfolioSnap.data()),
      };
    } else {
      return null;
    }
  } catch (error) {
    devWarn('getPortfolio error:', error?.message || error);
    return null;
  }
};

// Get single request
export const getRequest = async (requestId) => {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const requestSnap = await getDoc(requestRef);

    if (requestSnap.exists()) {
      return {
        id: requestSnap.id,
        ...convertTimestamps(requestSnap.data()),
      };
    } else {
      return null;
    }
  } catch (error) {
    devWarn('getRequest error:', error?.message || error);
    return null;
  }
};
