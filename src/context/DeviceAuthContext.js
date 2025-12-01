import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import deviceSecurity from '../utils/deviceSecurity';
import securityLimiter from '../utils/securityLimiter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut as firebaseSignOut } from '../services/auth/firebaseAuth';

const DeviceAuthContext = createContext();

export const useDeviceAuth = () => {
  const context = useContext(DeviceAuthContext);
  if (!context) {
    throw new Error('useDeviceAuth must be used within DeviceAuthProvider');
  }
  return context;
};

export const DeviceAuthProvider = ({ children }) => {
  const [currentDevice, setCurrentDevice] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('unknown'); // 'trusted', 'new', 'blocked', 'suspicious'
  const [loading, setLoading] = useState(false);
  const activeWatcherRef = useRef(null);
  const currentDeviceRef = useRef(null);
  const isMountedRef = useRef(true);

  // Cihaz bilgilerini başlat
  useEffect(() => {
    initializeDevice();
    return () => { isMountedRef.current = false; };
  }, []);

  const initializeDevice = async () => {
    try {
      const fingerprint = await deviceSecurity.generateDeviceFingerprint();
      if (isMountedRef.current) {
        setCurrentDevice(fingerprint);
      }
      currentDeviceRef.current = fingerprint;
      await deviceSecurity.saveDeviceInfo();
      return fingerprint;
    } catch (error) {
      // Silent fail
    }
  };

  // Kullanıcının cihaz listesini al
  const getUserDevices = async (userId) => {
    try {
      console.log('📋 GET USER DEVICES:', userId);
      const userDevicesRef = doc(db, 'userDevices', userId);
      const docSnap = await getDoc(userDevicesRef);
      
      if (docSnap.exists()) {
        const devices = docSnap.data().devices || [];
        console.log('📋 FOUND DEVICES:', devices.length, devices.map(d => `${d.deviceId} (${d.isActive ? 'active' : 'inactive'})`));
        return devices;
      }
      console.log('📋 NO DEVICES DOC');
      return [];
    } catch (error) {
      console.log('📋 GET DEVICES ERROR:', error.code, error.message);
      // Firestore permission hatası normal - sessizce devam et
      return [];
    }
  };

  // Cihaz kaydet/güncelle
  const registerDevice = async (userId, deviceInfo, isActive = true) => {
    try {
      console.log('🔥 REGISTER DEVICE START:', userId, deviceInfo.deviceId);
      const userDevicesRef = doc(db, 'userDevices', userId);
      const docSnap = await getDoc(userDevicesRef);
      console.log('📊 Document exists:', docSnap.exists());

      const deviceData = {
        ...deviceInfo,
        userId,
        isActive,
        registeredAt: Date.now(),
        lastUsed: Date.now(),
        loginCount: 1,
      };

      if (docSnap.exists()) {
        const currentData = docSnap.data();
        const devices = currentData.devices || [];
        
        // Mevcut cihaz var mı kontrol et
        const existingDeviceIndex = devices.findIndex(d => d.deviceId === deviceInfo.deviceId);
        
        if (existingDeviceIndex >= 0) {
          // Mevcut cihazı güncelle
          devices[existingDeviceIndex] = {
            ...devices[existingDeviceIndex],
            lastUsed: Date.now(),
            loginCount: (devices[existingDeviceIndex].loginCount || 0) + 1,
            isActive,
          };
        } else {
          // Yeni cihaz ekle
          devices.push(deviceData);
        }

        await updateDoc(userDevicesRef, {
          devices,
          lastUpdated: serverTimestamp(),
        });
        console.log('✅ DEVICE UPDATED in existing doc, total devices:', devices.length);
      } else {
        // İlk cihaz kaydı
        await setDoc(userDevicesRef, {
          userId,
          devices: [deviceData],
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        console.log('✅ NEW DEVICE DOC CREATED');
      }

      console.log('🎉 REGISTER DEVICE SUCCESS!');
      return { success: true };
    } catch (error) {
      console.log('❌ REGISTER DEVICE ERROR:', error.code, error.message);
      // Firestore permission hatası normal - sessizce devam et
      return { success: false, error: error.message };
    }
  };

  // Diğer cihazları deaktive et (Single Active Device)
  const deactivateOtherDevices = async (userId, currentDeviceId) => {
    try {
      console.log('🔄 DEACTIVATING OTHER DEVICES for user:', userId, 'keeping:', currentDeviceId);
      const userDevicesRef = doc(db, 'userDevices', userId);
      const docSnap = await getDoc(userDevicesRef);

      if (docSnap.exists()) {
        const currentData = docSnap.data();
        const devices = currentData.devices || [];
        console.log('📱 Total devices found:', devices.length);

        // Diğer tüm cihazları deaktive et
        const updatedDevices = devices.map(device => ({
          ...device,
          isActive: device.deviceId === currentDeviceId,
          deactivatedAt: device.deviceId !== currentDeviceId ? Date.now() : null,
        }));

        await updateDoc(userDevicesRef, {
          devices: updatedDevices,
          lastUpdated: serverTimestamp(),
        });

        console.log('✅ DEVICES DEACTIVATED for user:', userId);
        return { success: true };
      }

      console.log('❌ NO DEVICES DOC for user:', userId);
      return { success: false, error: 'User devices not found' };
    } catch (error) {
      console.log('❌ DEACTIVATE DEVICES ERROR for user:', userId, error.code, error.message);
      // Firestore permission hatası normal - sessizce devam et
      return { success: false, error: error.message };
    }
  };

  // Specific device'ı bir user için deaktive et (Multi-account security)
  const deactivateSpecificDevice = async (userId, deviceId) => {
    try {
      console.log('🚫 DEACTIVATING SPECIFIC DEVICE for user:', userId, 'device:', deviceId);
      
      // Permission check - eğer permission yoksa skip et
      const userDevicesRef = doc(db, 'userDevices', userId);
      const docSnap = await getDoc(userDevicesRef);

      if (docSnap.exists()) {
        const currentData = docSnap.data();
        const devices = currentData.devices || [];

        // Specific device'ı deaktive et
        const updatedDevices = devices.map(device => ({
          ...device,
          isActive: device.deviceId === deviceId ? false : device.isActive,
          deactivatedAt: device.deviceId === deviceId ? Date.now() : device.deactivatedAt,
        }));

        await updateDoc(userDevicesRef, {
          devices: updatedDevices,
          lastUpdated: serverTimestamp(),
        });

        console.log('✅ SPECIFIC DEVICE DEACTIVATED for user:', userId);
        return { success: true };
      }

      console.log('❌ NO DEVICES DOC for user:', userId);
      return { success: false, error: 'User devices not found' };
    } catch (error) {
      // Permission hatası normalde bekleniyor - sadece log ve skip
      if (error.code === 'permission-denied') {
        console.log('⚠️ PERMISSION DENIED for user:', userId, '- Skipping deactivation');
        return { success: false, error: 'Permission denied - skipped' };
      }
      console.log('❌ DEACTIVATE SPECIFIC DEVICE ERROR:', error.code, error.message);
      return { success: false, error: error.message };
    }
  };

  // Cihaz doğrulama (giriş sırasında)
  const verifyDevice = async (userId) => {
    try {
      setLoading(true);

      // Blok durumu kontrol et
      const blockStatus = await securityLimiter.checkBlockStatus(userId);
      if (blockStatus.isBlocked) {
        setDeviceStatus('blocked');
        return {
          success: false,
          blocked: true,
          message: `Hesabınız bloklanmış. Sebep: ${blockStatus.reason}. ${blockStatus.remainingMinutes} dakika sonra tekrar deneyebilirsiniz.`,
        };
      }

      if (!currentDeviceRef.current) {
        await initializeDevice();
      }

      const device = currentDeviceRef.current || currentDevice;
      const userDevices = await getUserDevices(userId);
      const existingDevice = userDevices.find(d => d.deviceId === device?.deviceId);

      if (!existingDevice) {
        // Yeni cihaz - SMS onay gerekli
        setDeviceStatus('new');
        return {
          success: false,
          requiresVerification: true,
          message: 'Bu cihazdan ilk kez giriş yapıyorsunuz. SMS onayı gereklidir.',
        };
      }

      // Cihaz değişikliği kontrolü
      const deviceChanged = await deviceSecurity.detectDeviceChange(existingDevice);
      if (deviceChanged) {
        setDeviceStatus('suspicious');
        return {
          success: false,
          requiresVerification: true,
          message: 'Cihaz bilgilerinde değişiklik tespit edildi. SMS onayı gereklidir.',
        };
      }

      // Güvenlik riski değerlendirmesi
      const riskAssessment = deviceSecurity.evaluateSecurityRisk(userDevices, device);
      if (riskAssessment.riskLevel === 'HIGH') {
        setDeviceStatus('blocked');
        return {
          success: false,
          requiresVerification: true,
          message: 'Güvenlik riski tespit edildi. Ek doğrulama gereklidir.',
        };
      }

      // Diğer aktif cihazları kontrol et
      const activeDevices = userDevices.filter(d => d.isActive && d.deviceId !== device.deviceId);
      if (activeDevices.length > 0) {
        // Diğer cihazları deaktive et
        await deactivateOtherDevices(userId, device.deviceId);
      }

      // Mevcut cihazı aktif yap
      await registerDevice(userId, device, true);
      setDeviceStatus('trusted');

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // SMS onayından sonra cihaz kayıt
  const confirmDeviceWithSMS = async (userId, smsCode) => {
    try {
      console.log('📱 CONFIRM DEVICE WITH SMS START:', userId, smsCode.length);
      setLoading(true);

      // SMS kodu doğrulama (burada basit kontrol, gerçekte SMS servis entegrasyonu)
      const code = String(smsCode || '');
      if (code.length !== 6) {
        console.log('❌ SMS CODE LENGTH ERROR:', smsCode.length);
        return { success: false, error: 'Geçersiz SMS kodu' };
      }

      // Cihaz değişimi kaydet (limit kontrolü)
      const userDevices = await getUserDevices(userId);
      const oldDevice = userDevices.find(d => d.isActive);
      
      if (oldDevice && oldDevice.deviceId !== currentDevice.deviceId) {
        const changeResult = await securityLimiter.recordDeviceChange(
          userId, 
          oldDevice.deviceId, 
          currentDevice.deviceId
        );

        if (!changeResult.success && changeResult.blocked) {
          setDeviceStatus('blocked');
          return {
            success: false,
            blocked: true,
            message: changeResult.message,
          };
        }

        if (changeResult.warning) {
          Alert.alert('Uyarı', changeResult.message);
        }
      }

      // Diğer cihazları deaktive et
      console.log('🔄 DEACTIVATING OTHER DEVICES...');
      if (!currentDeviceRef.current) {
        await initializeDevice();
      }
      const device = currentDeviceRef.current || currentDevice;
      await deactivateOtherDevices(userId, device.deviceId);

      // Yeni cihazı kaydet ve aktif yap
      console.log('💾 REGISTERING NEW DEVICE...');
      const registerResult = await registerDevice(userId, device, true);
      console.log('💾 REGISTER RESULT:', registerResult.success);
      
      setDeviceStatus('trusted');

      // Local storage'a güvenilir cihaz olarak işaretle
      console.log('💰 SAVING TO ASYNCSTORAGE...');
      await AsyncStorage.setItem(`trusted_device_${userId}`, device.deviceId);
      console.log('✅ CONFIRM DEVICE COMPLETE!');

      return { success: true };
    } catch (error) {
      console.log('❌ CONFIRM DEVICE COMPLETE ERROR:', error.code, error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Cihaz listesini temizle (çıkış yaparken)
  const clearDeviceSession = async (userId) => {
    try {
      const device = currentDeviceRef.current || currentDevice;
      if (device) {
        const userDevicesRef = doc(db, 'userDevices', userId);
        const docSnap = await getDoc(userDevicesRef);

        if (docSnap.exists()) {
          const currentData = docSnap.data();
          const devices = currentData.devices || [];

          const updatedDevices = devices.map(d => ({
            ...d,
            // Çıkışta cihazı pasif yapma; sadece lastLogout güncelle
            isActive: d.isActive,
            lastLogout: d.deviceId === device.deviceId ? Date.now() : d.lastLogout,
          }));

          await updateDoc(userDevicesRef, {
            devices: updatedDevices,
            lastUpdated: serverTimestamp(),
          });
        }
      }

      // Trusted cihaz bilgisini koru ki aynı cihazdan yeniden girişte OTP istemesin
      setDeviceStatus('unknown');
    } catch (error) {
      // Silent fail
    }
  };

  const startWatcher = async (userId, attempt = 0) => {
    try {
      // Kapat ve yeniden başlat
      if (activeWatcherRef.current) {
        activeWatcherRef.current();
        activeWatcherRef.current = null;
      }

      if (!userId) {
        return;
      }
      if (!currentDeviceRef.current) {
        await initializeDevice();
      }

      // HIZLI! Auth state sync için minimal bekleme
      await new Promise(res => setTimeout(res, 50)); // 400ms → 50ms HIZLANDIRMA!
      if (!isMountedRef.current) {
        return;
      }

      const userDevicesRef = doc(db, 'userDevices', userId);
      activeWatcherRef.current = onSnapshot(
        userDevicesRef,
        (snap) => {
          try {
            const data = snap.data();
            const devices = data?.devices || [];
            const thisDevice = devices.find(d => d.deviceId === (currentDeviceRef.current?.deviceId || currentDevice?.deviceId));
            
            console.log('👁️ DEVICE WATCHER:', userId, 'devices:', devices.length, 'thisDevice active:', thisDevice?.isActive);
            
            if (thisDevice && thisDevice.isActive === false) {
              // Bu cihaz başka yerden deaktive edildi → zorunlu çıkış
              console.log('🚨 DEVICE DEACTIVATED BY ANOTHER LOGIN - FORCING LOGOUT');
              AsyncStorage.removeItem(`trusted_device_${userId}`).catch(() => {});
              firebaseSignOut().catch(() => {});
            }
          } catch (_) {}
        },
        (error) => {
          // İzin hatası: genelde auth propagation gecikmesi → kısa bir gecikme ile tekrar dene
          if (error?.code === 'permission-denied' && attempt < 5) {
            setTimeout(() => {
              if (!isMountedRef.current) {
                return;
              }
              startWatcher(userId, attempt + 1);
            }, 200); // 800ms → 200ms HIZLANDIRMA!
          }
          // Diğer hataları sessiz geç
        }
      );
    } catch (_) {}
  };

  const value = {
    currentDevice,
    deviceStatus,
    loading,
    verifyDevice,
    confirmDeviceWithSMS,
    clearDeviceSession,
    getUserDevices,
    registerDevice,
    deactivateOtherDevices,
    deactivateSpecificDevice,
    startActiveDeviceWatcher: async (userId) => startWatcher(userId, 0),
    stopActiveDeviceWatcher: () => {
      if (activeWatcherRef.current) {
        activeWatcherRef.current();
        activeWatcherRef.current = null;
      }
    },
  };

  return (
    <DeviceAuthContext.Provider value={value}>
      {children}
    </DeviceAuthContext.Provider>
  );
};
