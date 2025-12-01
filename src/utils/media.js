// Türkçe: Bunny helper'ları ve bayrak yönetimi
import { auth } from '../firebase';
import { Platform } from 'react-native';
import { USE_BUNNY as USE_BUNNY_ENV, BUNNY_CDN_HOST as BUNNY_CDN_HOST_ENV, MEDIA_API_BASE as MEDIA_API_BASE_ENV } from '@env';

const DEFAULT_CDN_HOST = 'media.talepify.com';

// Dev log helpers
const devLog = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.log(...args); /* eslint-enable no-console */ } catch {} } };
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

// Türkçe: RN ortamında env değişkenleri sınırlı olabilir; fallback'lerle çalışıyoruz
export const USE_BUNNY = String(USE_BUNNY_ENV || process.env.USE_BUNNY || 'true').toLowerCase() === 'true';
export const BUNNY_CDN_HOST = BUNNY_CDN_HOST_ENV || process.env.BUNNY_CDN_HOST || DEFAULT_CDN_HOST;

// Türkçe: Yeni CDN helper fonksiyonu - Bunny Optimizer parametreleriyle
const CDN_HOST = BUNNY_CDN_HOST || 'talepify-cdn.b-cdn.net';

export const cdn = (path, params = {}) => {
  const url = new URL(`https://${CDN_HOST}/${String(path).replace(/^\/+/, '')}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  return url.toString();
};
// Türkçe: Kullanım örnekleri:
// cdn("public/daire1.jpg", { width: 600, height: 400, fit: "cover" })
// cdn("public/daire1.jpg", { width: 1200, dpr: 2 })

// Türkçe: API tabanı - geliştirme için yerel, prod için Functions
const MEDIA_API_BASE_ENV_FALLBACK = process.env.MEDIA_API_BASE;
const DEV_LOCAL_BASE = Platform.select({ android: 'http://10.0.2.2:4001', ios: 'http://localhost:4001', default: undefined });
const DEFAULT_FUNCTIONS_BASE = 'https://europe-west1-apptalepify-14dbc.cloudfunctions.net/bunny';
export const API_BASE = MEDIA_API_BASE_ENV || MEDIA_API_BASE_ENV_FALLBACK || DEFAULT_FUNCTIONS_BASE;

// Debug (geliştirme için)
devLog('MEDIA API_BASE =', API_BASE);

// Türkçe: Bunny Optimizer URL oluşturucu
export function img(url, opts = {}) {
  try {
    if (!url || typeof url !== 'string') {
      return url;
    }
    if (!USE_BUNNY) {
      return url;
    }
    const cdnHost = BUNNY_CDN_HOST;
    if (!url.includes(cdnHost)) {
      return url; // Sadece Bunny CDN için parametre ekle
    }
    const { w, h, q = 85, autoOptimize = 'high' } = opts;
    const u = new URL(url);
    if (w) {
      u.searchParams.set('width', String(w));
    }
    if (h) {
      u.searchParams.set('height', String(h));
    }
    if (q) {
      u.searchParams.set('quality', String(q));
    }
    if (autoOptimize) {
      u.searchParams.set('auto_optimize', String(autoOptimize));
    }
    return u.toString();
  } catch (_) {
    return url;
  }
}

// Türkçe: URL temizleyici - 'null'/'undefined'/boş/bozuk değerleri eler, yalnızca http(s)/file kabul eder
export function sanitizeImageUrl(input) {
  try {
    if (!input || (typeof input !== 'string' && typeof input !== 'number')) {
      return null;
    }
    const raw = String(input).trim();
    if (!raw) { return null; }
    // Çevresel tırnakları temizle
    const unquoted = raw.replace(/^['"]|['"]$/g, '');
    // Boşlukla veya virgülle birleştirilmiş parçalardan ilkini al
    const firstToken = unquoted.split(/[\s,;]+/)[0].trim();
    if (!firstToken) { return null; }
    const lower = firstToken.toLowerCase();
    if (lower === 'null' || lower === 'undefined') { return null; }
    if (lower.startsWith('blob:') || lower.startsWith('data:')) { return null; }
    if (!(lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('file://'))) {
      return null;
    }
    // Basit bir URL doğrulaması (try/catch)
    try { new URL(firstToken); } catch (_) { return null; }
    return firstToken;
  } catch (_) {
    return null;
  }
}

// Türkçe: Firebase ID token al (mock token YOK - prod güvenliği)
async function getIdToken() {
  const user = auth.currentUser;
  if (user) {
    return user.getIdToken();
  }
  devWarn('🟧 Firebase Auth oturumu yok; Authorization header eklenmeyecek');
  return null;
}

// Türkçe: Görseli Bunny'ye yükle
export async function uploadImageToBunny({ fileUri, fileName, mime, path = 'images/portfolios' }) {
  if (!USE_BUNNY) {
    throw new Error('Bunny devre dışı');
  }

  // Türkçe: Yerel test için auth bypass (DISABLE_AUTH=true sunucuda)
  let headers = {};
  try {
    const token = await getIdToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (authErr) {
    // Yerel test ortamında DISABLE_AUTH=true ile çalışır
    devWarn('🟧 Auth bypass (yerel test):', authErr?.message);
  }
  const formData = new FormData();
  
  // React Native için doğru FormData formatı
  const fileExtension = mime?.includes('jpeg') || mime?.includes('jpg') ? '.jpg' : '.png';
  const finalFileName = fileName || `upload-${Date.now()}${fileExtension}`;
  
  formData.append('file', {
    uri: fileUri,
    type: mime || 'image/jpeg',
    name: finalFileName
  });
  
  formData.append('path', path);

  // 12s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), 12000);
  let resp;
  try {
    resp = await fetch(`${API_BASE}/uploadImage`, {
      method: 'POST',
      headers: {
        ...headers,
        // NOT: React Native'de FormData ile Content-Type header'ı otomatik ayarlanır
        // 'Content-Type': 'multipart/form-data' EKLEMEMEK gerekiyor!
      },
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Yükleme hatası: ${resp.status} ${text}`);
  }
  return resp.json();
}

// Türkçe: Bunny'den görsel sil
export async function deleteImageFromBunny({ storagePath }) {
  if (!USE_BUNNY) {
    throw new Error('Bunny devre dışı');
  }

  let headers = {};
  try {
    const token = await getIdToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (authErr) {
    devWarn('🟧 Auth bypass (yerel test):', authErr?.message);
  }

  // 8s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), 8000);
  let resp;
  try {
    resp = await fetch(`${API_BASE}/deleteImage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ storagePath }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Silme hatası: ${resp.status} ${text}`);
  }
  return resp.json();
}

// Türkçe: Web indirimi için URL üret (orijinal, parametresiz)
export function buildWebDownloadUrl(originalUrl, name) {
  const u = new URL(`${API_BASE}/downloadOriginal`);
  u.searchParams.set('url', originalUrl);
  if (name) {
    u.searchParams.set('name', name);
  }
  return u.toString();
}

// Türkçe: Ses dosyasını Bunny'ye yükle (Base64 ile - Android FormData sorunu için)
export async function uploadAudioToBunny({ fileUri, fileName, userId }) {
  if (!USE_BUNNY) {
    throw new Error('Bunny devre dışı');
  }

  devLog('🎤 Ses yükleme başlıyor (Base64):', { fileUri, fileName, userId });

  let headers = {};
  try {
    const token = await getIdToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      devLog('✅ Auth token alındı');
    }
  } catch (authErr) {
    devWarn('🟧 Auth bypass (yerel test):', authErr?.message);
  }

  // RNFS ile dosyayı base64'e çevir
  const RNFS = require('react-native-fs');
  let filePath = fileUri.replace(/^file:\/\//, '');
  
  // İlk slash eksikse ekle (Android path'i / ile başlamalı)
  if (!filePath.startsWith('/')) {
    filePath = '/' + filePath;
  }
  
  devLog('📖 Dosya okunuyor:', filePath);
  const base64Data = await RNFS.readFile(filePath, 'base64');
  devLog('✅ Base64 boyutu:', Math.round(base64Data.length / 1024), 'KB');
  
  // Dosya uzantısını URI'den al
  const uriExtension = fileUri.split('.').pop();
  const finalFileName = fileName || `audio-${userId}-${Date.now()}.${uriExtension}`;
  
  const endpoint = `${API_BASE}/uploadAudio`;
  devLog('🚀 Yükleme endpoint:', endpoint);
  
  try {
    // 15s timeout (ses dosyaları büyük olabilir)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), 15000);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        base64: base64Data,
        fileName: finalFileName,
        path: 'audio/notes',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    devLog('📡 Response status:', resp.status);

    if (!resp.ok) {
      const text = await resp.text();
      // eslint-disable-next-line no-console
      console.error('❌ Yükleme hatası:', resp.status, text);
      throw new Error(`Ses yükleme hatası: ${resp.status} ${text}`);
    }

    const result = await resp.json();
    devLog('✅ Yükleme başarılı:', result);
    return result.url || result.cdnUrl;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Network hatası:', error);
    throw error;
  }
}