import { db, auth, doc, getDoc, collection, addDoc, updateDoc } from '../firebase';
import { sendNotification } from './notificationService';
import { API_BASE_URL } from '@env';
// SMS imports kaldırıldı - sadece bildirim kullanılıyor

// İzin onaylama handler'ı - SERVER ENDPOINT KULLAN
const devLog = (...args) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
};
const maskId = (val) => {
  if (!val) { return ''; }
  const s = String(val);
  if (s.length <= 6) { return '***'; }
  return s.slice(0, 3) + '***' + s.slice(-3);
};

export const handleApprovePermission = async (permissionRequestId, approverUserId) => {
  try {
    devLog('🔔 handleApprovePermission:', { permissionRequestId: maskId(permissionRequestId), approverUserId: maskId(approverUserId) });
    
    if (!approverUserId) {
      devLog('❌ Kullanıcı oturumu yok');
      return { success: false, message: 'Kullanıcı oturumu yok' };
    }

    devLog('🔔 API_BASE_URL exists:', !!API_BASE_URL);
    const token = await auth.currentUser?.getIdToken?.();
    devLog('🔔 Auth token alındı:', !!token);
    if (!API_BASE_URL || !token) {
      return { success: false, message: 'Kimlik doğrulama veya API yapılandırması eksik' };
    }
    
    const url = `${API_BASE_URL}/permissions/approve`;
    devLog('🔔 Request URL:', url);
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ permissionRequestId }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    devLog('🔔 Response status:', resp.status);
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      devLog('❌ Response error:', text);
      return { success: false, message: text || 'Sunucu hatası' };
    }

    devLog('✅ İzin onaylandı');
    return { success: true, message: 'İzin başarıyla onaylandı' };
  } catch (error) {
    devLog('❌ İzin onaylanırken hata:', error);
    return { success: false, message: error.message };
  }
};

// İzin reddetme handler'ı - SERVER ENDPOINT KULLAN
export const handleRejectPermission = async (permissionRequestId, rejecterUserId) => {
  try {
    if (!rejecterUserId) {
      return { success: false, message: 'Kullanıcı oturumu yok' };
    }

    const token = await auth.currentUser?.getIdToken?.();
    if (!API_BASE_URL || !token) {
      return { success: false, message: 'Kimlik doğrulama veya API yapılandırması eksik' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${API_BASE_URL}/permissions/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ permissionRequestId }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { success: false, message: text || 'Sunucu hatası' };
    }

    return { success: true, message: 'İzin reddedildi' };
  } catch (error) {
    devLog('İzin reddedilirken hata:', error);
    return { success: false, message: error.message };
  }
};

// İzin kaldırma handler'ı
export const handleRevokePermission = async (permissionRequestId, revokerUserId) => {
  try {
    const permissionRef = doc(db, 'permissionRequests', permissionRequestId);
    const permissionDoc = await getDoc(permissionRef);
    
    if (!permissionDoc.exists()) {
      throw new Error('İzin bulunamadı');
    }
    
    const permissionData = permissionDoc.data();
    
    // İzin durumunu iptal edildi olarak güncelle
    await updateDoc(permissionRef, {
      status: 'revoked',
      revokedBy: revokerUserId,
      revokedAt: new Date(),
      updatedAt: new Date(),
    });
    
    // İzin sahibine iptal bildirimi gönder
    const revokeNotificationData = {
      title: 'Paylaşım İzniniz İptal Edildi',
      body: `${permissionData.portfolioTitle} portföyünü paylaşma izniniz portföy sahibi tarafından iptal edildi.`,
      data: {
        type: 'permission_revoked',
        permissionRequestId: permissionRequestId,
        portfolioId: permissionData.portfolioId,
      portfolioTitle: permissionData.portfolioTitle,
    },
    };
    
    await sendNotification(permissionData.requesterId, revokeNotificationData);
    
    devLog('İzin iptal edildi ve bildirim gönderildi');
    return { success: true, message: 'İzin başarıyla iptal edildi' };
    
  } catch (error) {
    devLog('İzin iptal edilirken hata:', error);
    throw error;
  }
};

// Özel paylaşım linki oluşturma
export const generateCustomShareLink = async (permissionRequestId, sharerUserId) => {
  try {
    devLog('🔗 Ozel link olusturuluyor:', { permissionRequestId: maskId(permissionRequestId), sharerUserId: maskId(sharerUserId) });
    
    const permissionRef = doc(db, 'permissionRequests', permissionRequestId);
    const permissionDoc = await getDoc(permissionRef);
    
    if (!permissionDoc.exists()) {
      throw new Error('İzin bulunamadı');
    }
    
    const permissionData = permissionDoc.data();
    
    // İzin onaylanmış mı kontrol et
    if (permissionData.status !== 'approved') {
      throw new Error('Bu portföy için izniniz bulunmuyor veya henüz onaylanmamış');
    }
    
    // Özel paylaşım linki oluştur
    const customShareData = {
      permissionRequestId: permissionRequestId,
      originalPortfolioId: permissionData.portfolioId,
      sharerUserId: sharerUserId,
      sharerName: permissionData.requesterName,
      sharerPhone: permissionData.requesterPhone,
      sharerEmail: permissionData.requesterEmail,
      portfolioTitle: permissionData.portfolioTitle,
      createdAt: new Date(),
      isActive: true,
    };
    
    devLog('🔗 Firestore yazilacak data (keys):', Object.keys(customShareData));
    devLog('🔗 Auth user ID:', maskId(auth.currentUser?.uid));
    
    // Paylaşan kullanıcının güncel bilgilerini al
    const sharerDoc = await getDoc(doc(db, 'users', sharerUserId));
    let sharerInfo = {
      name: 'Kullanıcı',
      phone: '',
      email: '',
      avatar: '',
    };
    
    if (sharerDoc.exists()) {
      const sharerData = sharerDoc.data();
      sharerInfo = {
        name: sharerData.name || sharerData.displayName || 'Kullanıcı',
        phone: sharerData.phoneNumber || '',
        email: sharerData.email || '',
        avatar: sharerData.avatar || '',
      };
    }
    
    // Güncellenmiş custom share data
    const updatedCustomShareData = {
      ...customShareData,
      sharerName: sharerInfo.name,
      sharerPhone: sharerInfo.phone,
      sharerEmail: sharerInfo.email,
      sharerAvatar: sharerInfo.avatar,
    };
    
    devLog('🔗 Final custom share data (keys):', Object.keys(updatedCustomShareData));
    
    // Custom share collection'a ekle (Firebase v9+)
    devLog('🔗 Firestore collection yazma islemi basliyor...');
    devLog('🔗 Current auth state:', !!auth.currentUser);
    devLog('🔗 Data to write sharerUserId:', maskId(updatedCustomShareData.sharerUserId));
    devLog('🔗 Auth currentUser.uid:', maskId(auth.currentUser?.uid));
    devLog('🔗 Match check:', updatedCustomShareData.sharerUserId === auth.currentUser?.uid);
    
    let customShareRef;
    try {
      customShareRef = await addDoc(collection(db, 'customPortfolioShares'), updatedCustomShareData);
      devLog('🔗 Firestore yazma basarili, ref:', maskId(customShareRef.id));
    } catch (firestoreError) {
      devLog('🔗 Firestore specific error:', firestoreError);
      devLog('🔗 Firestore error code:', firestoreError.code);
      devLog('🔗 Firestore error message:', firestoreError.message);
      throw firestoreError;
    }
    
    // Custom link oluştur - web projesine doğru URL
    const customLink = `https://talepify.com/portfolio/${permissionData.portfolioId}?shared_by=${customShareRef.id}`;
    
    devLog('✅ Ozel paylasim linki olusturuldu:', customLink);
    return {
      success: true,
      shareUrl: customLink,
      shareId: customShareRef.id,
      message: 'Özel paylaşım linki oluşturuldu! Bu link ile portföyü kendi adınıza paylaşabilirsiniz.',
    };
    
  } catch (error) {
    devLog('🔗 Custom share error:', error);
    devLog('🔗 Error details:', error.code, error.message);
    throw error;
  }
};

// Bildirim action handler'ı - notification'dan gelen action'ları işler
export const handleNotificationAction = async (action, data, userId) => {
  try {
    switch (action) {
      case 'approve_permission': {
        return await handleApprovePermission(data.permissionRequestId, userId);
      }
      case 'reject_permission': {
        return await handleRejectPermission(data.permissionRequestId, userId);
      }
      case 'share_portfolio': {
        // Auth user ID kullan, notification userId değil
        devLog('🔗 Share portfolio - notification userId:', maskId(userId));
        devLog('🔗 Share portfolio - auth currentUser:', maskId(auth.currentUser?.uid));
        const actualUserId = auth.currentUser?.uid || userId;
        devLog('🔗 Share portfolio - actualUserId:', maskId(actualUserId));
        return await generateCustomShareLink(data.permissionRequestId, actualUserId);
      }
      case 'view_portfolio': {
        // Navigation to portfolio detail screen - portfolioId'den portfolio objesini al
        try {
          const portfolioDoc = await getDoc(doc(db, 'portfolios', data.portfolioId));
          if (!portfolioDoc.exists()) {
            throw new Error('Portföy bulunamadı');
          }
          const portfolio = { id: portfolioDoc.id, ...portfolioDoc.data() };
          return {
            success: true,
            action: 'navigate',
            screen: 'PropertyDetail',
            params: {
              portfolio,
              fromScreen: 'Notifications',
            },
          };
        } catch (error) {
          return {
            success: false,
            message: 'Portföy yüklenirken hata oluştu: ' + error.message,
          };
        }
      }
      case 'view_request':
        // Önce payload içindeki snapshot varsa onu kullan (okuma hatalarını önler)
        if (data?.requestSnapshot?.id) {
          return {
            success: true,
            action: 'navigate',
            screen: 'Taleplerim',
            params: { screen: 'RequestDetail', params: { request: data.requestSnapshot } },
          };
        }
        // Aksi halde sadece ID ile nested navigasyona yönlendir
        if (!data?.requestId) {
          return { success: false, message: 'Talep ID bulunamadı' };
        }
        return {
          success: true,
          action: 'navigate',
          screen: 'Taleplerim',
          params: { screen: 'RequestDetail', params: { requestId: String(data.requestId) } },
        };
      default: {
        devLog('Bilinmeyen action:', action);
        return { success: false, message: 'Bilinmeyen işlem' };
      }
    }
  } catch (error) {
    devLog('Notification action işlenirken hata:', error);
    return { success: false, message: error.message };
  }
};
