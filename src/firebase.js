import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration

// Firestore WebChannel warning'lerini gizle (sadece development)
if (__DEV__) {
  console.warn = (warning) => {
    if (warning.includes('WebChannelConnection') || warning.includes('transport errored')) {
      return; // Bu warning'leri gizle
    }
    console.log(warning); // Diğer warning'leri göster
  };
}

// YENİ HESAP KONFİGÜRASYONU
// Firebase Console > Project settings > Web app config
const firebaseConfig = {
  apiKey: 'AIzaSyBiWZ7qhgfze33o0ti8yc6-BjqZLgBdkoE',
  authDomain: 'apptalepify-14dbc.firebaseapp.com',
  projectId: 'apptalepify-14dbc',
  storageBucket: 'apptalepify-14dbc.firebasestorage.app',
  messagingSenderId: '39335689808',
  appId: '1:39335689808:web:d84c624218b88bb1b65b55',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth with AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Export Firestore utilities for convenience
export { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  serverTimestamp,
  writeBatch,
  setDoc 
} from 'firebase/firestore';

export default app;
