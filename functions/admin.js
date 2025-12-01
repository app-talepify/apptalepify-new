// Firebase Admin SDK - Production-ready initialization
const admin = require('firebase-admin');

/**
 * Admin SDK konfigürasyonu doğrula
 */
function validateAdminConfig() {
  // Firebase functions config fallback (deprecated ama geçici olarak)
  const functions = require('firebase-functions');
  const config = functions.config?.() || {};
  
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || config.admin?.project_id;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || config.admin?.client_email;  
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || config.admin?.private_key;
  
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin config eksik - env veya config gerekli');
  }
  
  // Private key formatını kontrol et (sadece env'dan gelirse)
  if (privateKey && privateKey.includes('BEGIN PRIVATE KEY')) {
    if (!privateKey.includes('END PRIVATE KEY')) {
      throw new Error('FIREBASE_ADMIN_PRIVATE_KEY geçersiz format');
    }
  }
  
  return { projectId, clientEmail, privateKey };
}

/**
 * Admin SDK'yı güvenli şekilde initialize et (idempotent)
 */
function initializeAdminSDK() {
  try {
    // Zaten initialize edilmiş mi kontrol et
    if (admin.apps.length > 0) {
      console.log('[Admin] Firebase Admin SDK zaten initialize edilmiş');
      return admin.app();
    }
    
    // Config doğrulama
    const { projectId, clientEmail, privateKey } = validateAdminConfig();
    
    // Service account credentials
    const serviceAccount = {
      type: 'service_account',
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey,
    };
    
    // Admin SDK initialize
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: projectId,
    });
    
    console.log(`[Admin] Firebase Admin SDK initialize edildi: ${projectId}`);
    return app;
    
  } catch (error) {
    console.error('[Admin] Firebase Admin SDK initialization hatası:', error.message);
    throw error;
  }
}

// Initialize Admin SDK
initializeAdminSDK();

// Instances
const db = admin.firestore();
const auth = admin.auth();

// Firestore settings - production optimizations
db.settings({
  ignoreUndefinedProperties: true,
});

/**
 * Admin SDK durumunu kontrol et
 */
function getAdminStatus() {
  return {
    initialized: admin.apps.length > 0,
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    appsCount: admin.apps.length,
  };
}

/**
 * Güvenli shutdown
 */
async function shutdownAdmin() {
  try {
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(app => app.delete()));
      console.log('[Admin] Firebase Admin SDK kapatıldı');
    }
  } catch (error) {
    console.error('[Admin] Shutdown hatası:', error.message);
  }
}

module.exports = {
  admin,
  db,
  auth,
  getAdminStatus,
  shutdownAdmin,
};
