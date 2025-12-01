// Türkçe: Mobilde orijinal görsel indirme yardımcıları (parametresiz URL kullanın)
import RNFS from 'react-native-fs';
import { Platform, PermissionsAndroid } from 'react-native';

// Dev log helper
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

export async function downloadOriginalMobile({ url, fileName = `download-${Date.now()}` }) {
  if (!url) {
    throw new Error('Geçersiz URL');
  }

  // Android 13 ve öncesi için depolama izni kontrolü (scoped storage’a rağmen bazı cihazlar ister)
  if (Platform.OS === 'android' && Platform.Version < 33) {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: 'Depolama izni gerekli',
          message: 'Dosyayı indirmek için depolama erişimine izin verin.',
          buttonNeutral: 'Daha sonra',
          buttonNegative: 'İptal',
          buttonPositive: 'Tamam',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Depolama izni reddedildi');
      }
    } catch (e) {
      devWarn('Depolama izni isteği hatası:', e?.message || e);
      throw e;
    }
  }

  const safeName = String(fileName || `download-${Date.now()}`).replace(/[^\w.\-]/g, '_');
  const destDir = Platform.OS === 'android' ? RNFS.DownloadDirectoryPath : RNFS.DocumentDirectoryPath;
  const destPath = `${destDir}/${safeName}`;

  const controller = new AbortController?.constructor?.(); // RNFS download cancel token yok; sadece timeout simule edeceğiz
  let timeoutId;
  try {
    // 30s güvenli zaman aşımı
    await new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        devWarn('İndirme zaman aşımı:', url);
        reject(new Error('İndirme zaman aşımı'));
      }, 30000);

      RNFS.downloadFile({ fromUrl: url, toFile: destPath })
        .promise
        .then((result) => {
          clearTimeout(timeoutId);
          if (result.statusCode >= 200 && result.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(`İndirme hatası: ${result.statusCode}`));
          }
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
    });

    return { ok: true, path: destPath };
  } catch (e) {
    // Hedef dosyayı temizlemeyi dene
    try { await RNFS.unlink(destPath); } catch {}
    throw e;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
