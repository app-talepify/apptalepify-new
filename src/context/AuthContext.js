/* eslint-disable no-console, no-trailing-spaces */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Alert, Platform, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { API_BASE_URL, NOTIF_ENABLED } from '@env';
import trialManager from '../utils/trialManager';
import { ReferralManager } from '../utils/referralSystem';
import { simpleHash } from '../utils/hash';
import notifX from '../services/notifications/NotificationService';
import notificationService from '../services/notificationService';

// Constants - Session service ile sync
const STORAGE_KEYS = {
  USER_UID: 'userUid',
  USER_PROFILE: 'userProfile',
  PHONE_NUMBER: 'phoneNumber',
  LAST_LOGIN_METHOD: 'lastLoginMethod',
};

const USER_ROLES = {
  MEMBER: 'member',
  ADMIN: 'admin',
  SUPER_ADMIN: 'superadmin',
};

const DEFAULT_PROFILE = {
  city: 'Samsun',
  officeName: '',
  profilePicture: 'default-logo',
  role: USER_ROLES.MEMBER,
  status: 'active',
  referralCode: null,
  referredBy: null,
};

const AuthContext = createContext();

// Fallback: Client-side token temizleme
async function clientSideFallbackTokenCleanup(uid) {
  try {
    const tokensRef = collection(db, 'users', uid, 'tokens');
    const tokensSnap = await getDocs(tokensRef);
    if (!tokensSnap.empty) {
      const batch = writeBatch(db);
      tokensSnap.docs.forEach(d => {
        batch.update(d.ref, {
          isActive: false,
          deactivatedAt: serverTimestamp(),
          deactivatedReason: 'user_logout',
        });
      });
      await batch.commit();
      console.log('✅ FCM Token client-side fallback ile temizlendi');
    }
  } catch (error) {
    console.log('⚠️ Client-side fallback token temizleme hatası:', error.message);
  }
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(USER_ROLES.MEMBER);
  const [unreadCount, setUnreadCount] = useState(0);


  // Bildirim sayısını merkezi olarak yönet
  useEffect(() => {
    if (!user?.uid) {
      setUnreadCount(0);
      return;
    }

    let isMounted = true;

    const fetchCount = async () => {
      try {
        let finalCount = 0;
        // Firestore'dan sayıyı almayı önceliklendir (daha güvenilir)
        if (NOTIF_ENABLED && NOTIF_ENABLED !== 'false') {
          const remoteCount = await notificationService.getUnreadNotificationCount(user.uid);
          finalCount = remoteCount > 0 ? remoteCount : 0;
        }

        // Eğer remote'dan bir şey gelmezse veya notifler kapalıysa local'e bak
        if (finalCount === 0) {
            const userKey = `notifications_${user.uid}`;
            const stored = await AsyncStorage.getItem(userKey);
            if (stored) {
              const arr = JSON.parse(stored);
              const localCount = Array.isArray(arr)
                ? arr.filter(n => (typeof n.isRead === 'boolean' ? !n.isRead : !n.read)).length
                : 0;
              finalCount = localCount;
            }
        }
        
        if (isMounted) {
          setUnreadCount(finalCount);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('[AuthContext] Unread count fetch failed:', error);
        }
        if (isMounted) {
          setUnreadCount(0); // Hata durumunda sıfırla
        }
      }
    };

    fetchCount(); // İlk yükleme

    // Canlı dinleyiciler
    const notifEvt = DeviceEventEmitter.addListener('notifications:updated', fetchCount);
    const interval = setInterval(fetchCount, 60000); // periyodu 60 saniyeye düşür

    let unsub = null;
    if (NOTIF_ENABLED && NOTIF_ENABLED !== 'false') {
      try {
        unsub = notifX.subscribeUnreadCount(user.uid, (cnt) => {
          if (isMounted) {
            setUnreadCount(prev => Math.max(prev || 0, cnt || 0));
          }
        });
      } catch (e) {
        if (__DEV__) console.warn('[AuthContext] Unread count subscription failed:', e);
      }
    }

    return () => {
      isMounted = false;
      clearInterval(interval);
      notifEvt?.remove?.();
      try { unsub && unsub(); } catch (e) {}
    };
  }, [user?.uid]);


  const fetchUserProfile = useCallback(async (uid) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const profileData = userDocSnap.data();
        const formattedProfile = {
          uid: uid,
          ...profileData,
          createdAt: profileData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updatedAt: profileData.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          subscriptionExpiryDate: profileData.subscriptionExpiryDate?.toDate?.()?.toISOString() || null,
        };

        setUserProfile(formattedProfile);
        setUserRole(profileData.role || USER_ROLES.MEMBER);
      } else {
        const newProfile = {
          uid: uid,
          phoneNumber: user?.phoneNumber || '',
          displayName: user?.displayName || '',
          ...DEFAULT_PROFILE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(userDocRef, newProfile);
        const formattedProfile = {
          ...newProfile,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setUserProfile(formattedProfile);
        setUserRole(USER_ROLES.MEMBER);
      }
    } catch (error) {
      // Silent error handling
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    const loadStoredUserLocal = async () => {
      try {
        const [storedUid, storedProfile] = await AsyncStorage.multiGet([
          STORAGE_KEYS.USER_UID,
          STORAGE_KEYS.USER_PROFILE,
        ]);

        const userUid = storedUid[1] ? storedUid[1] : null;
        const profileData = storedProfile[1] ? JSON.parse(storedProfile[1]) : null;

        if (userUid && profileData) {
          // Firebase Auth state ile sync için UID'den user objesi oluştur
          const mockUser = { uid: userUid };
          
          if (!userUid.startsWith('test-user-')) {
            try {
              const userDocRef = doc(db, 'users', userUid);
              const userDocSnap = await getDoc(userDocRef);

              if (userDocSnap.exists()) {
                const firestoreProfile = userDocSnap.data();
                const updatedProfile = {
                  uid: userUid,
                  ...firestoreProfile,
                  createdAt: firestoreProfile.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                  updatedAt: firestoreProfile.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                  subscriptionExpiryDate: firestoreProfile.subscriptionExpiryDate?.toDate?.()?.toISOString() || null,
                };

          setUser(mockUser);
          setUserProfile(updatedProfile);
          setUserRole(updatedProfile.role || USER_ROLES.MEMBER);

          await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updatedProfile));
          return;
              }
            } catch (firestoreError) {
              // Silent error handling
            }
          }

          setUser(mockUser);
          setUserProfile(profileData);
          setUserRole(profileData.role || USER_ROLES.MEMBER);
        }
      } catch (error) {
        // Silent error handling
      }
    };

    const fetchUserProfileLocal = async (uid) => {
      try {
        // console.log('[AuthContext] Fetching user profile for UID:', uid); // Production'da kapat
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);

        // console.log('[AuthContext] Firestore doc exists:', userDocSnap.exists()); // Production'da kapat
        
        if (userDocSnap.exists()) {
          const profileData = userDocSnap.data();
          const formattedProfile = {
            uid: uid,
            ...profileData,
            createdAt: profileData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            updatedAt: profileData.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            subscriptionExpiryDate: profileData.subscriptionExpiryDate?.toDate?.()?.toISOString() || null,
          };

          setUserProfile(formattedProfile);
          setUserRole(profileData.role || USER_ROLES.MEMBER);
        } else {
          const newProfile = {
            uid: uid,
            phoneNumber: '',
            displayName: '',
            ...DEFAULT_PROFILE,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          await setDoc(userDocRef, newProfile);
          const formattedProfile = {
            ...newProfile,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          setUserProfile(formattedProfile);
          setUserRole(USER_ROLES.MEMBER);
        }
      } catch (error) {
        // console.error('[AuthContext] Error fetching user profile locally:', error); // Production'da kapat
        // console.error('[AuthContext] Error code:', error.code); // Production'da kapat  
        // console.error('[AuthContext] Error message:', error.message); // Production'da kapat
        setUserProfile(null);
      }
    };

    const handleAuthStateChange = async (firebaseUser) => {
      if (!isMounted) {
        return;
      }

      if (firebaseUser) {
        setUser(firebaseUser);
        await fetchUserProfileLocal(firebaseUser.uid);
      } else {
        await loadStoredUserLocal();
      }
      setLoading(false);
    };

    // Sadece Firebase Auth listener'ı kullan - duplicate initialization'ı kaldır
    const unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (phoneNumber, password, userData) => {
    try {
      setLoading(true);

      // Unique ID oluştur (Firebase Auth yerine)
      const uid = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Şifreyi hash'le
      const passwordHash = simpleHash(password);

      const profile = {
        uid: uid,
        phoneNumber: phoneNumber,
        passwordHash: passwordHash,
        displayName: userData.displayName || '',
        city: userData.city || DEFAULT_PROFILE.city,
        officeName: userData.officeName || DEFAULT_PROFILE.officeName,
        profilePicture: userData.profilePicture || DEFAULT_PROFILE.profilePicture,
        role: USER_ROLES.MEMBER,
        status: DEFAULT_PROFILE.status,
        referralCode: DEFAULT_PROFILE.referralCode,
        referredBy: userData.referredBy || DEFAULT_PROFILE.referredBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const userDocRef = doc(db, 'users', uid);
      await setDoc(userDocRef, profile);

      if (phoneNumber) {
        const trialResult = await trialManager.startTrial(phoneNumber);
        if (!trialResult.success) {
          // Silent error handling
        }
      }

      if (userData.referredBy) {
        try {
          const referralManager = new ReferralManager(uid);
          const referralResult = await referralManager.processReferral(userData.referredBy, uid);
          if (!referralResult.success) {
            // Silent error handling
          }
        } catch (error) {
          // Silent error handling
        }
      }

      const profileData = {
        ...profile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Local state güncelle (Firebase Auth yok)
      setUser({ uid: uid, phoneNumber: phoneNumber });
      setUserProfile(profileData);
      setUserRole(USER_ROLES.MEMBER);

      // Local storage'a kaydet (UID ve profil)
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.USER_UID, uid],
        [STORAGE_KEYS.USER_PROFILE, JSON.stringify(profileData)],
        [STORAGE_KEYS.LAST_LOGIN_METHOD, 'phone_signup'],
      ]);

      return {
        success: true,
        user: {
          uid: uid,
          phoneNumber: phoneNumber,
          displayName: userData.displayName,
        },
        profile: profileData,
      };
    } catch (error) {
      console.error('Kayıt hatası:', error);
      const errorMessage = 'Kayıt olurken bir hata oluştu: ' + error.message;
      // Alert.alert kaldırıldı - Register ekranı error'ı handle ediyor
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (phoneNumber, verificationCode) => {
    try {
      setLoading(true);

      try {
        const cleanPhone = phoneNumber.replace(/\s/g, '');
        
        // Telefon numarasını farklı formatlarda dene
        const phoneVariations = [
          phoneNumber, // 05354648228
          cleanPhone, // 05354648228
          `+90${cleanPhone.substring(1)}`, // +905354648228 (0'ı çıkar, +90 ekle)
          `+90 ${cleanPhone.substring(1, 4)} ${cleanPhone.substring(4, 7)} ${cleanPhone.substring(7, 9)} ${cleanPhone.substring(9)}`, // +90 535 464 82 28
          cleanPhone.substring(1), // 5354648228 (0'ı çıkar)
          `90${cleanPhone.substring(1)}`, // 905354648228
        ];

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('phoneNumber', 'in', phoneVariations));
        
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          throw new Error('Bu telefon numarası ile kayıtlı kullanıcı bulunamadı. Lütfen önce kayıt olun.');
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();

        const userObj = {
          uid: userDoc.id,
          phoneNumber: phoneNumber,
        };

        const profileData = {
          uid: userDoc.id,
          ...userData,
          createdAt: userData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updatedAt: userData.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        };

        setUser(userObj);
        setUserProfile(profileData);
        setUserRole(profileData.role || USER_ROLES.MEMBER);

        await AsyncStorage.multiSet([
          [STORAGE_KEYS.USER_UID, userObj.uid],
          [STORAGE_KEYS.USER_PROFILE, JSON.stringify(profileData)],
          [STORAGE_KEYS.LAST_LOGIN_METHOD, 'phone_otp'],
        ]);

        return { success: true, user: userObj };
      } catch (firebaseError) {
        throw new Error(firebaseError.message || 'Kullanıcı bulunamadı. Lütfen önce kayıt olun.');
      }
    } catch (error) {
      
      let errorMessage = 'Giriş yaparken bir hata oluştu.';

      if (error.message.includes('Geçersiz')) {
        errorMessage = error.message;
      }

      // Alert.alert kaldırıldı - ekranlar error'ı handle ediyor
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // FCM token cleanup (server endpoint kullan)
      try {
        if (user?.uid) {
          if (__DEV__) console.log('🔐 FCM Token temizleme başlıyor (server endpoint):', user.uid);

          const idToken = await auth.currentUser?.getIdToken?.();

          if (idToken) {
            try {
              const response = await fetch(`${API_BASE_URL}/notifications/unregister-token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ uid: user.uid }),
              });

              if (response.ok) {
                if (__DEV__) console.log('✅ FCM Token serverda temizlendi');
              } else {
                if (__DEV__) console.log('⚠️ Server token temizleme başarısız, fallback kullanılıyor');
                await clientSideFallbackTokenCleanup(user.uid);
              }
            } catch (error) {
              if (__DEV__) console.log('⚠️ Server token temizleme hatası, fallback kullanılıyor:', error?.message);
              await clientSideFallbackTokenCleanup(user.uid);
            }
          } else {
            // Auth idToken yoksa server çağrısını atla, direkt fallback uygula
            await clientSideFallbackTokenCleanup(user.uid);
          }
        }

      // Local FCM token'ı da sil (yalnızca web)
      if (Platform.OS === 'web') {
        try {
          const { getMessaging, deleteToken } = require('firebase/messaging');
          const { getApp } = require('firebase/app');
          const app = getApp();
          const msg = getMessaging(app);
          await deleteToken(msg).catch(() => {});
        } catch (_) {}
      }
      } catch (_) {}

      // Trial verilerini temizle
      await trialManager.clearTrialData();

      // Firebase Auth'tan çıkış yap
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }

      // AsyncStorage key'leri al
      const allKeys = await AsyncStorage.getAllKeys();

      // Trusted device anahtarı korunmalı (aynı cihaz için OTP bypass)
      const trustedKey = user ? `trusted_device_${user.uid}` : null;

      // Kullanıcı ile ilgili key'leri seç ve trusted device key'ini hariç tut
      const userRelatedKeys = allKeys.filter(key => {
        // Trusted device key'ini koru
        if (trustedKey && key === trustedKey) {
          return false; // Bu key'i temizleme
        }
        
        // Diğer kullanıcı key'lerini temizle (trusted_device hariç!)
        return (key.includes('user') || 
                key.includes('User') || 
                key.includes('profile') || 
                key.includes('Profile') ||
                key.includes('security_') ||
                key.includes('notifications') ||
                key.includes('cached_profile_image'));
      });

      await AsyncStorage.multiRemove(userRelatedKeys);

      // State'leri sıfırla
      setUser(null);
      setUserProfile(null);
      setUserRole(USER_ROLES.MEMBER);
      
    } catch (error) {
      Alert.alert('Hata', 'Çıkış yaparken bir hata oluştu.');
    }
  }, [user]);

  const clearStoredData = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([STORAGE_KEYS.USER_UID, STORAGE_KEYS.USER_PROFILE]);
    } catch (error) {
      // Silent error handling
    }
  }, []);

  const clearTrialData = useCallback(async () => {
    try {
      await trialManager.clearTrialData();
    } catch (error) {
      // Silent error handling
    }
  }, []);

  // Hesap silme fonksiyonu
  const deleteAccount = useCallback(async () => {
    try {
      setLoading(true);
      
      console.log('=== HESAP SİLME İŞLEMİ BAŞLADI ===');
      
      if (!user || !userProfile) {
        return { success: false, error: 'Kullanıcı bilgileri bulunamadı' };
      }

      // OTP doğrulama artık AccountDeletion sayfasında yapılıyor
      console.log('OTP önceden doğrulanmış, hesap silme işlemi devam ediyor');

      // ÖNCELİKLE Firestore verilerini sil (Auth kullanıcısı silinince izin kaybı olabilir)
      
      // Firestore'dan kullanıcı verilerini sil
      try {
        await deleteDoc(doc(db, 'users', user.uid));
        console.log('Firestore kullanıcı verileri silindi');
      } catch (userError) {
        console.error('Kullanıcı verisi silme hatası:', userError);
        throw userError; // User silme kritik, hata fırlatılsın
      }

      // Kullanıcının portföylerini sil
      try {
        const portfoliosQuery = query(collection(db, 'portfolios'), where('userId', '==', user.uid));
        const portfoliosSnapshot = await getDocs(portfoliosQuery);
        const portfolioDeletions = portfoliosSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(portfolioDeletions);
        console.log('Kullanıcı portföyleri silindi');
      } catch (portfolioError) {
        console.error('Kullanıcı portföyleri silme hatası:', portfolioError);
        // Bu hata kritik değil, devam et
      }

      // Kullanıcının taleplerini sil  
      try {
        const requestsQuery = query(collection(db, 'requests'), where('userId', '==', user.uid));
        const requestsSnapshot = await getDocs(requestsQuery);
        const requestDeletions = requestsSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(requestDeletions);
        console.log('Kullanıcı talepleri silindi');
      } catch (requestError) {
        console.error('Kullanıcı talepleri silme hatası:', requestError);
        // Bu hata kritik değil, devam et
      }

      // Kullanıcının bildirimlerini sil (server-side endpoint ile)
      try {
        // Sessizce dene; client delete Firestore rules tarafından engellenir
        if (NOTIF_ENABLED && NOTIF_ENABLED !== 'false') {
          try {
            const token = await auth.currentUser?.getIdToken?.();
            await fetch(`${API_BASE_URL}/notifications/delete-all`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token || 'mock-id-token-for-development'}`,
              },
              body: JSON.stringify({}),
            });
          } catch (_) {}
        }
        console.log('Kullanıcı bildirimleri silme isteği gönderildi');
      } catch (notificationError) {
        console.error('Kullanıcı bildirimleri silme hatası:', notificationError);
        // Bu hata kritik değil, devam et
      }

      // Kullanıcının randevularını sil
      try {
        const appointmentsQuery = query(collection(db, 'appointments'), where('userId', '==', user.uid));
        const appointmentsSnapshot = await getDocs(appointmentsQuery);
        const appointmentDeletions = appointmentsSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(appointmentDeletions);
        console.log('Kullanıcı randevuları silindi');
      } catch (appointmentError) {
        console.error('Kullanıcı randevuları silme hatası:', appointmentError);
        // Bu hata kritik değil, devam et
      }

      // AsyncStorage'ı temizle
      await AsyncStorage.clear();
      console.log('AsyncStorage temizlendi');

      // SON OLARAK Firebase Auth kullanıcısını sil
      try {
        if (auth.currentUser) {
          await auth.currentUser.delete();
          console.log('Firebase Auth kullanıcısı silindi');
        }
      } catch (authError) {
        console.error('Firebase Auth kullanıcısı silme hatası:', authError);
        // Auth silme başarısız olsa da logout yap
        try {
          await auth.signOut();
          console.log('Auth silme başarısız, logout yapıldı');
        } catch (signOutError) {
          console.error('Logout hatası:', signOutError);
        }
      }

      // State'leri sıfırla
      setUser(null);
      setUserProfile(null);
      setUserRole(USER_ROLES.MEMBER);

      console.log('=== HESAP SİLME İŞLEMİ TAMAMLANDI ===');
      
      return { success: true };
    } catch (error) {
      console.error('Hesap silme hatası:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [user, userProfile]);

  const removePhoneFromTrialList = useCallback(async (phoneNumber) => {
    try {
      await trialManager.removePhoneFromUsedList(phoneNumber);
    } catch (error) {
      // Silent error handling
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('Başarılı', 'Şifre sıfırlama e-postası gönderildi.');
      return { success: true };
    } catch (error) {
      const errorMessage = 'Şifre sıfırlama e-postası gönderilemedi.';
      Alert.alert('Hata', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  const updateProfile = useCallback(async (updates) => {
    try {
      if (!user) {
        throw new Error('Kullanıcı girişi yapılmamış');
      }

      const userDocRef = doc(db, 'users', user.uid);
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp(),
      };

      if (updates.name) {
        updateData.displayName = updates.name;
      }

      await updateDoc(userDocRef, updateData);

      setUserProfile(prev => {
        const newProfile = { ...prev, ...updates };
        if (updates.name) {
          newProfile.displayName = updates.name;
        }
        return newProfile;
      });

      return { success: true };
    } catch (error) {
      Alert.alert('Hata', 'Profil güncellenirken bir hata oluştu.');
      return { success: false, error: error.message };
    }
  }, [user]);

  const updateUserRole = useCallback(async (uid, newRole) => {
    try {
      if (userRole !== USER_ROLES.SUPER_ADMIN) {
        throw new Error('Bu işlem için yetkiniz yok');
      }

      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, {
        role: newRole,
        updatedAt: serverTimestamp(),
      });

      if (uid === user?.uid) {
        setUserRole(newRole);
        setUserProfile(prev => ({ ...prev, role: newRole }));
      }

      return { success: true };
    } catch (error) {
      Alert.alert('Hata', 'Kullanıcı rolü güncellenirken bir hata oluştu.');
      return { success: false, error: error.message };
    }
  }, [userRole, user]);

  const generateReferralCode = useCallback(async () => {
    try {
      if (!user || !userProfile) {
        throw new Error('Kullanıcı girişi yapılmamış veya profil yüklenemedi');
      }

      const referralManager = new ReferralManager(user.uid);
      const result = await referralManager.generateUserReferralCode(userProfile.displayName);

      if (result.success) {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, {
          referralCode: result.referralCode,
          updatedAt: serverTimestamp(),
        });

        setUserProfile(prev => ({
          ...prev,
          referralCode: result.referralCode,
        }));

        return result;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      Alert.alert('Hata', 'Referans kodu oluşturulamadı: ' + error.message);
      return { success: false, error: error.message };
    }
  }, [user, userProfile]);

  const getReferralStats = useCallback(async () => {
    try {
      if (!user) {
        throw new Error('Kullanıcı girişi yapılmamış');
      }

      const referralManager = new ReferralManager(user.uid);
      return await referralManager.getUserReferralStats();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [user]);

  const claimReferralReward = useCallback(async (referralCode, referredUserId) => {
    try {
      if (!user) {
        throw new Error('Kullanıcı girişi yapılmamış');
      }

      const referralManager = new ReferralManager(user.uid);
      return await referralManager.claimReferralReward(referralCode, referredUserId);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [user]);

  // Mevcut kullanıcı için şifre güncelleme
  const updatePassword = useCallback(async (newPassword) => {
    try {
      if (!user || !userProfile) {
        throw new Error('Kullanıcı oturumu bulunamadı');
      }

      // Şifreyi hash'le
      const passwordHash = simpleHash(newPassword);

      // Firestore'da güncelle
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        passwordHash: passwordHash,
        updatedAt: serverTimestamp(),
      });

      // Local profile'ı güncelle
      const updatedProfile = {
        ...userProfile,
        passwordHash: passwordHash,
        updatedAt: new Date().toISOString(),
      };
      setUserProfile(updatedProfile);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updatedProfile));

      return { success: true };
    } catch (error) {
      Alert.alert('Hata', 'Şifre güncellenirken bir hata oluştu: ' + error.message);
      return { success: false, error: error.message };
    }
  }, [user, userProfile]);

  const isAdmin = useCallback(() => userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.SUPER_ADMIN, [userRole]);
  const isSuperAdmin = useCallback(() => userRole === USER_ROLES.SUPER_ADMIN, [userRole]);
  const isMember = useCallback(() => userRole === USER_ROLES.MEMBER, [userRole]);

  const value = useMemo(() => ({
    user,
    userProfile,
    userRole,
    loading,
    unreadCount, // Değeri paylaş
    setUnreadCount, // Manuel güncelleme için paylaş
    signUp,
    signIn,
    signOut,
    deleteAccount,
    clearStoredData,
    clearTrialData,
    removePhoneFromTrialList,
    resetPassword,
    updatePassword,
    updateProfile,
    updateUserRole,
    generateReferralCode,
    getReferralStats,
    claimReferralReward,
    isAdmin,
    isSuperAdmin,
    isMember,
    fetchUserProfile,
  }), [
    user,
    userProfile,
    userRole,
    loading,
    unreadCount, // Memo'ya ekle
    signUp,
    signIn,
    signOut,
    deleteAccount,
    clearStoredData,
    clearTrialData,
    removePhoneFromTrialList,
    resetPassword,
    updatePassword,
    updateProfile,
    updateUserRole,
    generateReferralCode,
    getReferralStats,
    claimReferralReward,
    isAdmin,
    isSuperAdmin,
    isMember,
    fetchUserProfile,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
